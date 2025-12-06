import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Search,
  Plus,
  Package,
  Warehouse,
  ArrowLeftRight,
  ClipboardList,
  AlertTriangle,
  BarChart3,
  Boxes,
  Tag,
  ArrowRight,
  MoreHorizontal,
} from "lucide-react";
import {
  useWarehouses,
  useProducts,
  useInventoryStock,
  useStockTransfers,
  useCycleCounts,
  useSerialNumbers,
  useBatchLots,
  useInventorySummary,
} from "@/hooks/useInventory";
import { WarehouseForm } from "@/components/forms/WarehouseForm";
import { ProductForm } from "@/components/forms/ProductForm";
import { StockTransferForm } from "@/components/forms/StockTransferForm";
import { CycleCountForm } from "@/components/forms/CycleCountForm";
import { format } from "date-fns";

const transferStatusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  pending: { label: "Pending", className: "bg-warning/10 text-warning" },
  in_transit: { label: "In Transit", className: "bg-primary/10 text-primary" },
  completed: { label: "Completed", className: "bg-success/10 text-success" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

const cycleCountStatusConfig: Record<string, { label: string; className: string }> = {
  scheduled: { label: "Scheduled", className: "bg-muted text-muted-foreground" },
  in_progress: { label: "In Progress", className: "bg-warning/10 text-warning" },
  completed: { label: "Completed", className: "bg-success/10 text-success" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

const Inventory = () => {
  const { data: warehouses = [], isLoading: warehousesLoading } = useWarehouses();
  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { data: stock = [], isLoading: stockLoading } = useInventoryStock();
  const { data: transfers = [], isLoading: transfersLoading } = useStockTransfers();
  const { data: cycleCounts = [], isLoading: countsLoading } = useCycleCounts();
  const { data: serialNumbers = [], isLoading: serialsLoading } = useSerialNumbers();
  const { data: batchLots = [], isLoading: batchLoading } = useBatchLots();
  const summary = useInventorySummary();

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  return (
    <AppLayout title="Inventory Management" subtitle="Warehouses, stock, transfers & tracking">
      {/* Inventory Flow Indicator */}
      <div className="mb-6 flex items-center justify-center gap-2 rounded-lg border border-border bg-card/50 p-3">
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-1.5 text-primary">
            <Warehouse className="h-4 w-4" />
            <span className="font-medium">Warehouse</span>
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Boxes className="h-4 w-4" />
            <span>Bin</span>
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Package className="h-4 w-4" />
            <span>Stock</span>
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ArrowLeftRight className="h-4 w-4" />
            <span>Transfer</span>
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <ClipboardList className="h-4 w-4" />
            <span>Count</span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <SummaryCard
          icon={BarChart3}
          label="Total Value"
          value={summary.isLoading ? null : formatCurrency(summary.totalValue)}
          iconBg="bg-primary/10"
          iconColor="text-primary"
        />
        <SummaryCard
          icon={Package}
          label="Total Items"
          value={summary.isLoading ? null : summary.totalItems.toLocaleString()}
          iconBg="bg-accent/10"
          iconColor="text-accent-foreground"
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Low Stock"
          value={summary.isLoading ? null : summary.lowStockItems.toString()}
          iconBg="bg-destructive/10"
          iconColor="text-destructive"
          valueColor="text-destructive"
        />
        <SummaryCard
          icon={ArrowLeftRight}
          label="Pending Transfers"
          value={summary.isLoading ? null : summary.pendingTransfers.toString()}
          iconBg="bg-warning/10"
          iconColor="text-warning"
        />
        <SummaryCard
          icon={Warehouse}
          label="Warehouses"
          value={summary.isLoading ? null : summary.warehouseCount.toString()}
          iconBg="bg-success/10"
          iconColor="text-success"
        />
        <SummaryCard
          icon={Tag}
          label="Products"
          value={summary.isLoading ? null : summary.productCount.toString()}
          iconBg="bg-muted"
          iconColor="text-muted-foreground"
        />
      </div>

      {/* Tabs for Inventory Workflow */}
      <Tabs defaultValue="stock" className="mt-6">
        <TabsList className="inline-flex h-10 w-auto">
          <TabsTrigger value="stock" className="gap-2">
            <Package className="h-4 w-4 hidden sm:inline" />
            Stock
          </TabsTrigger>
          <TabsTrigger value="warehouses" className="gap-2">
            <Warehouse className="h-4 w-4 hidden sm:inline" />
            Warehouses
          </TabsTrigger>
          <TabsTrigger value="products" className="gap-2">
            <Tag className="h-4 w-4 hidden sm:inline" />
            Products
          </TabsTrigger>
          <TabsTrigger value="transfers" className="gap-2">
            <ArrowLeftRight className="h-4 w-4 hidden sm:inline" />
            Transfers
          </TabsTrigger>
          <TabsTrigger value="counting" className="gap-2">
            <ClipboardList className="h-4 w-4 hidden sm:inline" />
            Counting
          </TabsTrigger>
          <TabsTrigger value="tracking" className="gap-2">
            <Boxes className="h-4 w-4 hidden sm:inline" />
            Tracking
          </TabsTrigger>
        </TabsList>

        {/* Stock Tab */}
        <TabsContent value="stock" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Inventory Stock</h3>
                <p className="text-sm text-muted-foreground">Current stock levels by warehouse</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search stock..." className="w-full sm:w-64 pl-9" />
                </div>
              </div>
            </div>

            {stockLoading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : stock.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No inventory stock"
                description="Add products and receive inventory to see stock levels"
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">SKU</TableHead>
                    <TableHead className="text-muted-foreground">Product</TableHead>
                    <TableHead className="text-muted-foreground">Warehouse</TableHead>
                    <TableHead className="text-muted-foreground text-right">On Hand</TableHead>
                    <TableHead className="text-muted-foreground text-right">Reserved</TableHead>
                    <TableHead className="text-muted-foreground text-right">Available</TableHead>
                    <TableHead className="text-muted-foreground text-right">Value</TableHead>
                    <TableHead className="text-muted-foreground w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stock.map((item: any) => {
                    const isLowStock = item.products?.reorder_point && 
                      Number(item.quantity_on_hand) <= Number(item.products.reorder_point);
                    return (
                      <TableRow key={item.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{item.products?.sku}</TableCell>
                        <TableCell className="text-foreground">{item.products?.name}</TableCell>
                        <TableCell className="text-muted-foreground">{item.warehouses?.name}</TableCell>
                        <TableCell className="text-right font-medium text-foreground">
                          {Number(item.quantity_on_hand).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground">
                          {Number(item.quantity_reserved).toLocaleString()}
                        </TableCell>
                        <TableCell className={cn("text-right font-medium", isLowStock && "text-destructive")}>
                          {Number(item.quantity_available).toLocaleString()}
                          {isLowStock && <AlertTriangle className="inline ml-1 h-4 w-4" />}
                        </TableCell>
                        <TableCell className="text-right text-foreground">
                          {formatCurrency(Number(item.total_value))}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Warehouses Tab */}
        <TabsContent value="warehouses" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Warehouses</h3>
                <p className="text-sm text-muted-foreground">Manage warehouse locations</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search warehouses..." className="w-full sm:w-64 pl-9" />
                </div>
                <WarehouseForm />
              </div>
            </div>

            {warehousesLoading ? (
              <TableSkeleton rows={5} cols={4} />
            ) : warehouses.length === 0 ? (
              <EmptyState
                icon={Warehouse}
                title="No warehouses"
                description="Create your first warehouse to start managing inventory"
                actionButton={<WarehouseForm trigger={<Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />Add Warehouse</Button>} />}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Code</TableHead>
                    <TableHead className="text-muted-foreground">Name</TableHead>
                    <TableHead className="text-muted-foreground">Address</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {warehouses.map((wh: any) => (
                    <TableRow key={wh.id} className="border-border">
                      <TableCell className="font-medium text-foreground">{wh.code}</TableCell>
                      <TableCell className="text-foreground">{wh.name}</TableCell>
                      <TableCell className="text-muted-foreground">{wh.address || "—"}</TableCell>
                      <TableCell>
                        <Badge className={wh.is_active ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}>
                          {wh.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Products Tab */}
        <TabsContent value="products" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Products</h3>
                <p className="text-sm text-muted-foreground">Manage product catalog</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search products..." className="w-full sm:w-64 pl-9" />
                </div>
                <ProductForm />
              </div>
            </div>

            {productsLoading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : products.length === 0 ? (
              <EmptyState
                icon={Tag}
                title="No products"
                description="Add products to your inventory catalog"
                actionButton={<ProductForm trigger={<Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />Add Product</Button>} />}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">SKU</TableHead>
                    <TableHead className="text-muted-foreground">Name</TableHead>
                    <TableHead className="text-muted-foreground">UOM</TableHead>
                    <TableHead className="text-muted-foreground">Valuation</TableHead>
                    <TableHead className="text-muted-foreground text-right">Std Cost</TableHead>
                    <TableHead className="text-muted-foreground text-right">Reorder Point</TableHead>
                    <TableHead className="text-muted-foreground">Tracking</TableHead>
                    <TableHead className="text-muted-foreground w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {products.map((product: any) => (
                    <TableRow key={product.id} className="border-border">
                      <TableCell className="font-medium text-foreground">{product.sku}</TableCell>
                      <TableCell className="text-foreground">{product.name}</TableCell>
                      <TableCell className="text-muted-foreground">{product.unit_of_measure}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="uppercase text-xs">
                          {product.valuation_method}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-foreground">
                        {formatCurrency(Number(product.standard_cost))}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {product.reorder_point || "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {product.is_serialized && <Badge variant="secondary" className="text-xs">Serial</Badge>}
                          {product.is_batch_tracked && <Badge variant="secondary" className="text-xs">Batch</Badge>}
                          {!product.is_serialized && !product.is_batch_tracked && <span className="text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Transfers Tab */}
        <TabsContent value="transfers" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Stock Transfers</h3>
                <p className="text-sm text-muted-foreground">Inter-warehouse transfers</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search transfers..." className="w-full sm:w-64 pl-9" />
                </div>
                <StockTransferForm />
              </div>
            </div>

            {transfersLoading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : transfers.length === 0 ? (
              <EmptyState
                icon={ArrowLeftRight}
                title="No transfers"
                description="Create transfers to move stock between warehouses"
                actionButton={<StockTransferForm trigger={<Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />New Transfer</Button>} />}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Transfer #</TableHead>
                    <TableHead className="text-muted-foreground">From</TableHead>
                    <TableHead className="text-muted-foreground">To</TableHead>
                    <TableHead className="text-muted-foreground">Date</TableHead>
                    <TableHead className="text-muted-foreground">Expected Arrival</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((transfer: any) => {
                    const status = transferStatusConfig[transfer.status] || transferStatusConfig.draft;
                    return (
                      <TableRow key={transfer.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{transfer.transfer_number}</TableCell>
                        <TableCell className="text-foreground">{transfer.from_warehouse?.name || "—"}</TableCell>
                        <TableCell className="text-foreground">{transfer.to_warehouse?.name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(transfer.transfer_date)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {transfer.expected_arrival_date ? formatDate(transfer.expected_arrival_date) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.className)}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Counting Tab */}
        <TabsContent value="counting" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Cycle Counts</h3>
                <p className="text-sm text-muted-foreground">Scheduled inventory counts</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search counts..." className="w-full sm:w-64 pl-9" />
                </div>
                <CycleCountForm />
              </div>
            </div>

            {countsLoading ? (
              <TableSkeleton rows={5} cols={5} />
            ) : cycleCounts.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No cycle counts"
                description="Schedule cycle counts to verify inventory accuracy"
                actionButton={<CycleCountForm trigger={<Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />Schedule Count</Button>} />}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Count #</TableHead>
                    <TableHead className="text-muted-foreground">Warehouse</TableHead>
                    <TableHead className="text-muted-foreground">Scheduled Date</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">Notes</TableHead>
                    <TableHead className="text-muted-foreground w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cycleCounts.map((count: any) => {
                    const status = cycleCountStatusConfig[count.status] || cycleCountStatusConfig.scheduled;
                    return (
                      <TableRow key={count.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{count.count_number}</TableCell>
                        <TableCell className="text-foreground">{count.warehouses?.name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(count.scheduled_date)}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.className)}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[200px] truncate">
                          {count.notes || "—"}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Tracking Tab */}
        <TabsContent value="tracking" className="mt-4">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Serial Numbers */}
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Serial Numbers</h3>
                  <p className="text-sm text-muted-foreground">Track items by serial</p>
                </div>
              </div>

              {serialsLoading ? (
                <TableSkeleton rows={3} cols={4} />
              ) : serialNumbers.length === 0 ? (
                <div className="p-8 text-center">
                  <Package className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-muted-foreground">No serial numbers tracked</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Serial #</TableHead>
                      <TableHead className="text-muted-foreground">Product</TableHead>
                      <TableHead className="text-muted-foreground">Warehouse</TableHead>
                      <TableHead className="text-muted-foreground">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {serialNumbers.slice(0, 5).map((serial: any) => (
                      <TableRow key={serial.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{serial.serial_number}</TableCell>
                        <TableCell className="text-foreground">{serial.products?.name}</TableCell>
                        <TableCell className="text-muted-foreground">{serial.warehouses?.name || "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">{serial.status}</Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            {/* Batch/Lots */}
            <div className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between border-b border-border p-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">Batch/Lots</h3>
                  <p className="text-sm text-muted-foreground">Track items by batch</p>
                </div>
              </div>

              {batchLoading ? (
                <TableSkeleton rows={3} cols={4} />
              ) : batchLots.length === 0 ? (
                <div className="p-8 text-center">
                  <Boxes className="h-12 w-12 mx-auto text-muted-foreground/50" />
                  <p className="mt-2 text-muted-foreground">No batch lots tracked</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground">Batch #</TableHead>
                      <TableHead className="text-muted-foreground">Product</TableHead>
                      <TableHead className="text-muted-foreground">Qty</TableHead>
                      <TableHead className="text-muted-foreground">Expiry</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchLots.slice(0, 5).map((batch: any) => (
                      <TableRow key={batch.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{batch.batch_number}</TableCell>
                        <TableCell className="text-foreground">{batch.products?.name}</TableCell>
                        <TableCell className="text-muted-foreground">{Number(batch.quantity).toLocaleString()}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {batch.expiry_date ? formatDate(batch.expiry_date) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

// Summary Card Component
interface SummaryCardProps {
  icon: React.ElementType;
  label: string;
  value: string | null;
  iconBg: string;
  iconColor: string;
  valueColor?: string;
}

const SummaryCard = ({ icon: Icon, label, value, iconBg, iconColor, valueColor }: SummaryCardProps) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-center gap-3">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", iconBg)}>
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>
      <div>
        <p className="text-sm text-muted-foreground">{label}</p>
        {value === null ? (
          <Skeleton className="h-6 w-20 mt-1" />
        ) : (
          <p className={cn("text-lg font-semibold", valueColor || "text-foreground")}>{value}</p>
        )}
      </div>
    </div>
  </div>
);

// Table Skeleton Component
const TableSkeleton = ({ rows, cols }: { rows: number; cols: number }) => (
  <div className="p-4 space-y-3">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="flex gap-4">
        {Array.from({ length: cols }).map((_, j) => (
          <Skeleton key={j} className="h-8 flex-1" />
        ))}
      </div>
    ))}
  </div>
);

// Empty State Component
interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description: string;
  actionButton?: React.ReactNode;
}

const EmptyState = ({ icon: Icon, title, description, actionButton }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-12">
    <Icon className="h-12 w-12 text-muted-foreground/50" />
    <h3 className="mt-4 text-lg font-medium text-foreground">{title}</h3>
    <p className="mt-2 text-sm text-muted-foreground">{description}</p>
    {actionButton && <div className="mt-4">{actionButton}</div>}
  </div>
);

export default Inventory;
