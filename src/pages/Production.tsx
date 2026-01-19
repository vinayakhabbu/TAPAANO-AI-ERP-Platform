import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Play, CheckCircle, Factory, Package, Cog, BarChart3, Calculator, Calendar, PackageCheck } from "lucide-react";
import { WorkCenterForm } from "@/components/forms/WorkCenterForm";
import { BOMForm } from "@/components/forms/BOMForm";
import { ProductionOrderForm } from "@/components/forms/ProductionOrderForm";
import { GoodsReceiptPostingForm } from "@/components/forms/GoodsReceiptPostingForm";
import {
  useWorkCenters,
  useBOMs,
  useProductionOrders,
  useMRPRuns,
  useRunMRP,
  useCapacitySchedules,
  useGenerateCapacitySchedule,
  useUpdateProductionOrderStatus,
  useUpdateOperationStatus,
  useProductionGoodsReceipts,
} from "@/hooks/useProduction";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

const statusColors: Record<string, string> = {
  draft: "secondary",
  planned: "outline",
  released: "default",
  in_progress: "default",
  partially_delivered: "default",
  completed: "default",
  cancelled: "destructive",
  pending: "secondary",
  running: "default",
};

export default function Production() {
  const { profile } = useAuth();
  const { data: workCenters, isLoading: wcLoading } = useWorkCenters();
  const { data: boms, isLoading: bomLoading } = useBOMs();
  const { data: orders, isLoading: ordersLoading } = useProductionOrders();
  const { data: mrpRuns, isLoading: mrpLoading } = useMRPRuns();
  const { data: capacitySchedules } = useCapacitySchedules();
  const { data: goodsReceipts, isLoading: grLoading } = useProductionGoodsReceipts();
  
  const runMRP = useRunMRP();
  const generateCapacity = useGenerateCapacitySchedule();
  const updateOrderStatus = useUpdateProductionOrderStatus();
  const updateOpStatus = useUpdateOperationStatus();

  const [wcDialogOpen, setWcDialogOpen] = useState(false);
  const [bomDialogOpen, setBomDialogOpen] = useState(false);
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [grDialogOpen, setGrDialogOpen] = useState(false);
  const [selectedOrderForGR, setSelectedOrderForGR] = useState<typeof orders extends (infer T)[] | undefined ? T : never | null>(null);

  const handleRunMRP = async () => {
    if (!profile?.org_id) return;
    await runMRP.mutateAsync({ org_id: profile.org_id, planning_horizon_days: 30 });
  };

  const handleGenerateCapacity = async () => {
    if (!profile?.org_id) return;
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 14);
    
    await generateCapacity.mutateAsync({
      org_id: profile.org_id,
      start_date: today.toISOString().split('T')[0],
      end_date: endDate.toISOString().split('T')[0],
    });
  };

  const handleOrderAction = async (orderId: string, action: 'release' | 'start' | 'complete') => {
    const statusMap = { release: 'released', start: 'in_progress', complete: 'completed' };
    await updateOrderStatus.mutateAsync({ id: orderId, status: statusMap[action] });
  };

  const handleOpAction = async (opId: string, action: 'start' | 'complete') => {
    const statusMap = { start: 'in_progress', complete: 'completed' };
    await updateOpStatus.mutateAsync({ id: opId, status: statusMap[action] });
  };

  return (
    <AppLayout title="Production Planning" subtitle="Manage manufacturing operations and material requirements">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Production Planning</h1>
            <p className="text-muted-foreground">Manage manufacturing operations and material requirements</p>
          </div>
        </div>

        <Tabs defaultValue="orders" className="space-y-6">
          <TabsList className="h-auto flex-wrap gap-1 p-1 bg-muted/50">
            <TabsTrigger value="orders" className="flex items-center gap-2 text-xs sm:text-sm">
              <Factory className="h-4 w-4" />
              <span className="hidden sm:inline">Orders</span>
              <span className="sm:hidden">Ord</span>
            </TabsTrigger>
            <TabsTrigger value="receipts" className="flex items-center gap-2 text-xs sm:text-sm">
              <PackageCheck className="h-4 w-4" />
              <span className="hidden sm:inline">Receipts</span>
              <span className="sm:hidden">Rcpt</span>
            </TabsTrigger>
            <TabsTrigger value="bom" className="flex items-center gap-2 text-xs sm:text-sm">
              <Package className="h-4 w-4" />
              <span>BOM</span>
            </TabsTrigger>
            <TabsTrigger value="workcenters" className="flex items-center gap-2 text-xs sm:text-sm">
              <Cog className="h-4 w-4" />
              <span className="hidden sm:inline">Work Centers</span>
              <span className="sm:hidden">WC</span>
            </TabsTrigger>
            <TabsTrigger value="mrp" className="flex items-center gap-2 text-xs sm:text-sm">
              <Calculator className="h-4 w-4" />
              <span>MRP</span>
            </TabsTrigger>
            <TabsTrigger value="capacity" className="flex items-center gap-2 text-xs sm:text-sm">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Capacity</span>
              <span className="sm:hidden">Cap</span>
            </TabsTrigger>
            <TabsTrigger value="shopfloor" className="flex items-center gap-2 text-xs sm:text-sm">
              <Calendar className="h-4 w-4" />
              <span className="hidden sm:inline">Shop Floor</span>
              <span className="sm:hidden">Floor</span>
            </TabsTrigger>
          </TabsList>

          {/* Production Orders */}
          <TabsContent value="orders">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Production Orders</CardTitle>
                  <CardDescription>Manufacturing order management</CardDescription>
                </div>
                <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4 mr-2" /> New Order</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>Create Production Order</DialogTitle>
                    </DialogHeader>
                    <ProductionOrderForm onSuccess={() => setOrderDialogOpen(false)} />
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {ordersLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order #</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>BOM</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Planned Start</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orders?.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.order_number}</TableCell>
                          <TableCell>{order.product?.name}</TableCell>
                          <TableCell>{order.bom?.bom_number}</TableCell>
                          <TableCell>{order.completed_quantity}/{order.planned_quantity}</TableCell>
                          <TableCell>
                            <Badge variant={statusColors[order.status] as "default" | "secondary" | "destructive" | "outline"}>
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{order.planned_start_date ? format(new Date(order.planned_start_date), "MMM d, yyyy") : "-"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              {order.status === 'draft' && (
                                <Button size="sm" variant="outline" onClick={() => handleOrderAction(order.id, 'release')}>
                                  Release
                                </Button>
                              )}
                              {order.status === 'released' && (
                                <Button size="sm" variant="outline" onClick={() => handleOrderAction(order.id, 'start')}>
                                  <Play className="h-3 w-3 mr-1" /> Start
                                </Button>
                              )}
                              {(order.status === 'in_progress' || order.status === 'released' || order.status === 'partially_delivered') && 
                               order.confirmed_quantity < order.planned_quantity && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => {
                                    setSelectedOrderForGR(order);
                                    setGrDialogOpen(true);
                                  }}
                                >
                                  <PackageCheck className="h-3 w-3 mr-1" /> Post GR
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Goods Receipts */}
          <TabsContent value="receipts">
            <Card>
              <CardHeader>
                <CardTitle>Production Goods Receipts</CardTitle>
                <CardDescription>Goods received from production orders</CardDescription>
              </CardHeader>
              <CardContent>
                {grLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Receipt #</TableHead>
                        <TableHead>Production Order</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Stock Type</TableHead>
                        <TableHead>Posted</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {goodsReceipts?.map((gr) => (
                        <TableRow key={gr.id}>
                          <TableCell className="font-medium">{gr.receipt_number}</TableCell>
                          <TableCell>{gr.production_order?.order_number}</TableCell>
                          <TableCell>{gr.product?.name}</TableCell>
                          <TableCell>{gr.quantity} {gr.uom}</TableCell>
                          <TableCell>
                            <Badge variant={gr.stock_type === 'sales_order_stock' ? "default" : "secondary"}>
                              {gr.stock_type === 'sales_order_stock' ? 'SO Stock' : 'Unrestricted'}
                            </Badge>
                          </TableCell>
                          <TableCell>{format(new Date(gr.posting_date), "MMM d, yyyy HH:mm")}</TableCell>
                        </TableRow>
                      ))}
                      {(!goodsReceipts || goodsReceipts.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground">
                            No goods receipts yet
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Bill of Materials */}
          <TabsContent value="bom">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Bills of Materials</CardTitle>
                  <CardDescription>Multi-level BOM management</CardDescription>
                </div>
                <Dialog open={bomDialogOpen} onOpenChange={setBomDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4 mr-2" /> New BOM</Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create Bill of Materials</DialogTitle>
                    </DialogHeader>
                    <BOMForm onSuccess={() => setBomDialogOpen(false)} />
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {bomLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>BOM #</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Components</TableHead>
                        <TableHead>Operations</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {boms?.map((bom) => (
                        <TableRow key={bom.id}>
                          <TableCell className="font-medium">{bom.bom_number}</TableCell>
                          <TableCell>{bom.product?.name} ({bom.product?.sku})</TableCell>
                          <TableCell>{bom.version}</TableCell>
                          <TableCell>{bom.bom_lines?.length || 0}</TableCell>
                          <TableCell>{bom.bom_operations?.length || 0}</TableCell>
                          <TableCell>
                            <Badge variant={bom.is_active ? "default" : "secondary"}>
                              {bom.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Work Centers */}
          <TabsContent value="workcenters">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Work Centers</CardTitle>
                  <CardDescription>Production resource management</CardDescription>
                </div>
                <Dialog open={wcDialogOpen} onOpenChange={setWcDialogOpen}>
                  <DialogTrigger asChild>
                    <Button><Plus className="h-4 w-4 mr-2" /> New Work Center</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Create Work Center</DialogTitle>
                    </DialogHeader>
                    <WorkCenterForm onSuccess={() => setWcDialogOpen(false)} />
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {wcLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Hourly Rate</TableHead>
                        <TableHead>Capacity (hrs/day)</TableHead>
                        <TableHead>Efficiency</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {workCenters?.map((wc) => (
                        <TableRow key={wc.id}>
                          <TableCell className="font-medium">{wc.code}</TableCell>
                          <TableCell>{wc.name}</TableCell>
                          <TableCell>${wc.hourly_rate?.toFixed(2)}</TableCell>
                          <TableCell>{wc.capacity_per_day}h</TableCell>
                          <TableCell>{wc.efficiency_rate}%</TableCell>
                          <TableCell>
                            <Badge variant={wc.is_active ? "default" : "secondary"}>
                              {wc.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* MRP */}
          <TabsContent value="mrp">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Material Requirements Planning</CardTitle>
                  <CardDescription>Calculate material needs and shortages</CardDescription>
                </div>
                <Button onClick={handleRunMRP} disabled={runMRP.isPending}>
                  <Calculator className="h-4 w-4 mr-2" />
                  {runMRP.isPending ? "Running..." : "Run MRP"}
                </Button>
              </CardHeader>
              <CardContent>
                {mrpLoading ? (
                  <p className="text-muted-foreground">Loading...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Run #</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Horizon</TableHead>
                        <TableHead>Requirements</TableHead>
                        <TableHead>Shortages</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mrpRuns?.map((run) => (
                        <TableRow key={run.id}>
                          <TableCell className="font-medium">{run.run_number}</TableCell>
                          <TableCell>{format(new Date(run.run_date), "MMM d, yyyy HH:mm")}</TableCell>
                          <TableCell>{run.planning_horizon_days} days</TableCell>
                          <TableCell>{run.total_requirements}</TableCell>
                          <TableCell>
                            <Badge variant={run.total_shortages > 0 ? "destructive" : "default"}>
                              {run.total_shortages}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={statusColors[run.status] as "default" | "secondary" | "destructive" | "outline"}>
                              {run.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Capacity */}
          <TabsContent value="capacity">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Capacity Planning</CardTitle>
                  <CardDescription>Resource scheduling and utilization</CardDescription>
                </div>
                <Button onClick={handleGenerateCapacity} disabled={generateCapacity.isPending}>
                  <BarChart3 className="h-4 w-4 mr-2" />
                  {generateCapacity.isPending ? "Generating..." : "Generate Schedule"}
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Work Center</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Available</TableHead>
                      <TableHead>Planned</TableHead>
                      <TableHead>Utilization</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {capacitySchedules?.map((cs) => {
                      const utilization = cs.available_hours > 0 
                        ? ((cs.planned_hours / cs.available_hours) * 100).toFixed(0) 
                        : 0;
                      return (
                        <TableRow key={cs.id}>
                          <TableCell className="font-medium">{cs.work_center?.name}</TableCell>
                          <TableCell>{format(new Date(cs.schedule_date), "MMM d, yyyy")}</TableCell>
                          <TableCell>{cs.available_hours}h</TableCell>
                          <TableCell>{cs.planned_hours?.toFixed(1)}h</TableCell>
                          <TableCell>
                            <Badge variant={Number(utilization) > 100 ? "destructive" : Number(utilization) > 80 ? "default" : "secondary"}>
                              {utilization}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Shop Floor */}
          <TabsContent value="shopfloor">
            <Card>
              <CardHeader>
                <CardTitle>Shop Floor Control</CardTitle>
                <CardDescription>Track production progress and operations</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {orders?.filter(o => o.status === 'in_progress' || o.status === 'released').map((order) => (
                    <div key={order.id} className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold">{order.order_number}</h3>
                          <p className="text-sm text-muted-foreground">{order.product?.name}</p>
                        </div>
                        <Badge variant={statusColors[order.status] as "default" | "secondary" | "destructive" | "outline"}>
                          {order.status}
                        </Badge>
                      </div>
                      
                      {order.operations && order.operations.length > 0 && (
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium">Operations</h4>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>#</TableHead>
                                <TableHead>Operation</TableHead>
                                <TableHead>Work Center</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {order.operations.map((op) => (
                                <TableRow key={op.id}>
                                  <TableCell>{op.operation_number}</TableCell>
                                  <TableCell>{op.operation_name}</TableCell>
                                  <TableCell>{op.work_center?.name}</TableCell>
                                  <TableCell>
                                    <Badge variant={statusColors[op.status] as "default" | "secondary" | "destructive" | "outline"}>
                                      {op.status}
                                    </Badge>
                                  </TableCell>
                                  <TableCell>
                                    {op.status === 'pending' && (
                                      <Button size="sm" variant="outline" onClick={() => handleOpAction(op.id, 'start')}>
                                        <Play className="h-3 w-3 mr-1" /> Start
                                      </Button>
                                    )}
                                    {op.status === 'in_progress' && (
                                      <Button size="sm" variant="outline" onClick={() => handleOpAction(op.id, 'complete')}>
                                        <CheckCircle className="h-3 w-3 mr-1" /> Complete
                                      </Button>
                                    )}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      )}
                    </div>
                  ))}
                  {(!orders || orders.filter(o => o.status === 'in_progress' || o.status === 'released').length === 0) && (
                    <p className="text-muted-foreground text-center py-8">No active production orders</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Goods Receipt Posting Dialog */}
        <Dialog open={grDialogOpen} onOpenChange={setGrDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Post Goods Receipt</DialogTitle>
            </DialogHeader>
            {selectedOrderForGR && (
              <GoodsReceiptPostingForm 
                productionOrder={selectedOrderForGR}
                onSuccess={() => {
                  setGrDialogOpen(false);
                  setSelectedOrderForGR(null);
                }} 
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
