import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  Search,
  Plus,
  Filter,
  Download,
  Mail,
  MoreHorizontal,
  Users,
  DollarSign,
  AlertCircle,
  FileText,
  ShoppingCart,
  Truck,
  CreditCard,
  ArrowRight,
  ClipboardList,
  Send,
  X,
} from "lucide-react";
import { useReceivables } from "@/hooks/useReceivables";
import { useQuotations, useUpdateQuotationStatus, useConvertToSalesOrder } from "@/hooks/useQuotations";
import { format } from "date-fns";
import { SalesOrderForm } from "@/components/forms/SalesOrderForm";
import { ShipmentForm } from "@/components/forms/ShipmentForm";
import { InvoiceForm } from "@/components/forms/InvoiceForm";

import { QuotationForm } from "@/components/forms/QuotationForm";
import { useToast } from "@/hooks/use-toast";

const invoiceStatusConfig = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  sent: { label: "Sent", className: "bg-cash/10 text-cash" },
  paid: { label: "Paid", className: "bg-success/10 text-success" },
  overdue: { label: "Overdue", className: "bg-destructive/10 text-destructive" },
};

const soStatusConfig = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  confirmed: { label: "Confirmed", className: "bg-primary/10 text-primary" },
  partially_shipped: { label: "Partial Ship", className: "bg-warning/10 text-warning" },
  shipped: { label: "Shipped", className: "bg-cash/10 text-cash" },
  invoiced: { label: "Invoiced", className: "bg-success/10 text-success" },
  cancelled: { label: "Cancelled", className: "bg-destructive/10 text-destructive" },
};

const quotationStatusConfig: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  sent: { label: "Sent", className: "bg-primary/10 text-primary" },
  accepted: { label: "Accepted", className: "bg-success/10 text-success" },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive" },
  expired: { label: "Expired", className: "bg-warning/10 text-warning" },
  converted: { label: "Converted", className: "bg-cash/10 text-cash" },
};

const Receivables = () => {
  const { customers, invoices, salesOrders, shipments, stats, isLoading } = useReceivables();
  const { data: quotations, isLoading: quotationsLoading } = useQuotations();
  const updateQuotationStatus = useUpdateQuotationStatus();
  const convertToSO = useConvertToSalesOrder();
  const { toast } = useToast();
  const [quotationFormOpen, setQuotationFormOpen] = useState(false);

  const handleQuotationStatusUpdate = async (id: string, status: "sent" | "accepted" | "rejected") => {
    try {
      await updateQuotationStatus.mutateAsync({ id, status });
      toast({ title: "Status Updated", description: `Quotation marked as ${status}` });
    } catch {
      toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
    }
  };

  const handleConvertToSO = async (id: string) => {
    try {
      await convertToSO.mutateAsync(id);
      toast({ title: "Converted", description: "Sales Order created from quotation" });
    } catch {
      toast({ title: "Error", description: "Failed to convert", variant: "destructive" });
    }
  };

  const quotationStats = {
    total: quotations?.length || 0,
    pending: quotations?.filter((q) => q.status === "sent").length || 0,
  };

  return (
    <AppLayout title="Order to Cash" subtitle="Quote to collection cycle management">
      {/* O2C Flow Indicator */}
      <div className="mb-6 rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary/50">
              <ClipboardList className="h-4 w-4 text-secondary-foreground" />
            </div>
            <span className="text-sm font-medium text-foreground">Quote</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <ShoppingCart className="h-4 w-4 text-primary" />
            </div>
            <span className="text-sm font-medium text-foreground">Sales Order</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cash/10">
              <Truck className="h-4 w-4 text-cash" />
            </div>
            <span className="text-sm font-medium text-foreground">Ship</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/10">
              <FileText className="h-4 w-4 text-warning" />
            </div>
            <span className="text-sm font-medium text-foreground">Invoice</span>
          </div>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-success/10">
              <CreditCard className="h-4 w-4 text-success" />
            </div>
            <span className="text-sm font-medium text-foreground">Collect</span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-secondary/50 p-2.5">
              <ClipboardList className="h-5 w-5 text-secondary-foreground" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pending Quotes</p>
              {quotationsLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{quotationStats.pending}</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <ShoppingCart className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Open Orders</p>
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{stats.salesOrderCount}</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cash/10 p-2.5">
              <Truck className="h-5 w-5 text-cash" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Shipments</p>
              {isLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{stats.shipmentCount}</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-warning/10 p-2.5">
              <DollarSign className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total AR</p>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold text-foreground">
                  ${stats.totalAR.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-destructive/10 p-2.5">
              <AlertCircle className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Overdue</p>
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold text-destructive">
                  ${stats.overdueAR.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs for O2C stages */}
      <Tabs defaultValue="quotations" className="mt-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="quotations" className="gap-2">
            <ClipboardList className="h-4 w-4" />
            Quotations
          </TabsTrigger>
          <TabsTrigger value="sales-orders" className="gap-2">
            <ShoppingCart className="h-4 w-4" />
            Sales Orders
          </TabsTrigger>
          <TabsTrigger value="shipping" className="gap-2">
            <Truck className="h-4 w-4" />
            Shipping
          </TabsTrigger>
          <TabsTrigger value="invoices" className="gap-2">
            <FileText className="h-4 w-4" />
            Invoices
          </TabsTrigger>
          <TabsTrigger value="collections" className="gap-2">
            <CreditCard className="h-4 w-4" />
            Collections
          </TabsTrigger>
        </TabsList>

        {/* Quotations Tab */}
        <TabsContent value="quotations">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Quotations</h3>
                <p className="text-sm text-muted-foreground">Create and manage customer quotations</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search quotes..." className="w-64 pl-9" />
                </div>
                <Button onClick={() => setQuotationFormOpen(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  New Quote
                </Button>
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Quote #</TableHead>
                  <TableHead className="text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-muted-foreground">Date</TableHead>
                  <TableHead className="text-muted-foreground">Valid Until</TableHead>
                  <TableHead className="text-muted-foreground text-right">Total</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {quotationsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : !quotations || quotations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <ClipboardList className="h-8 w-8" />
                        <p>No quotations found</p>
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 gap-2"
                          onClick={() => setQuotationFormOpen(true)}
                        >
                          <Plus className="h-4 w-4" />
                          Create your first quote
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  quotations.map((quote) => {
                    const status = quotationStatusConfig[quote.status] || quotationStatusConfig.draft;
                    return (
                      <TableRow key={quote.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{quote.quote_number}</TableCell>
                        <TableCell className="text-foreground">{quote.customers?.name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(quote.quote_date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {quote.valid_until ? format(new Date(quote.valid_until), "MMM d, yyyy") : "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground">
                          ${quote.total.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.className)}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {quote.status === "draft" && (
                                <DropdownMenuItem onClick={() => handleQuotationStatusUpdate(quote.id, "sent")}>
                                  <Send className="h-4 w-4 mr-2" /> Mark as Sent
                                </DropdownMenuItem>
                              )}
                              {quote.status === "sent" && (
                                <>
                                  <DropdownMenuItem onClick={() => handleQuotationStatusUpdate(quote.id, "accepted")}>
                                    <ArrowRight className="h-4 w-4 mr-2" /> Mark Accepted
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleQuotationStatusUpdate(quote.id, "rejected")}>
                                    <X className="h-4 w-4 mr-2" /> Mark Rejected
                                  </DropdownMenuItem>
                                </>
                              )}
                              {quote.status === "accepted" && (
                                <DropdownMenuItem onClick={() => handleConvertToSO(quote.id)}>
                                  <ArrowRight className="h-4 w-4 mr-2" /> Convert to Sales Order
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Sales Orders Tab */}
        <TabsContent value="sales-orders">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Sales Orders</h3>
                <p className="text-sm text-muted-foreground">Manage customer orders</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search orders..." className="w-64 pl-9" />
                </div>
                <SalesOrderForm />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">SO Number</TableHead>
                  <TableHead className="text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-muted-foreground">Order Date</TableHead>
                  <TableHead className="text-muted-foreground">Total</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : salesOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <ShoppingCart className="h-8 w-8" />
                        <p>No sales orders found</p>
                        <SalesOrderForm
                          trigger={
                            <Button variant="outline" size="sm" className="mt-2 gap-2">
                              <Plus className="h-4 w-4" />
                              Create your first order
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  salesOrders.map((so) => {
                    const status = soStatusConfig[so.status as keyof typeof soStatusConfig] || soStatusConfig.draft;
                    return (
                      <TableRow key={so.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{so.so_number}</TableCell>
                        <TableCell className="text-foreground">{so.customer_name}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(so.order_date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">
                          ${so.total.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.className)}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Shipping Tab */}
        <TabsContent value="shipping">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Shipments</h3>
                <p className="text-sm text-muted-foreground">Track order fulfillment</p>
              </div>
              <div className="flex items-center gap-3">
                <ShipmentForm />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Shipment #</TableHead>
                  <TableHead className="text-muted-foreground">Ship Date</TableHead>
                  <TableHead className="text-muted-foreground">Carrier</TableHead>
                  <TableHead className="text-muted-foreground">Tracking</TableHead>
                  <TableHead className="text-muted-foreground w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : shipments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Truck className="h-8 w-8" />
                        <p>No shipments found</p>
                        <ShipmentForm
                          trigger={
                            <Button variant="outline" size="sm" className="mt-2 gap-2">
                              <Plus className="h-4 w-4" />
                              Create shipment
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  shipments.map((shipment) => (
                    <TableRow key={shipment.id} className="border-border">
                      <TableCell className="font-medium text-foreground">{shipment.shipment_number}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(shipment.ship_date), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-foreground">{shipment.carrier || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">{shipment.tracking_number || "—"}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Invoices Tab */}
        <TabsContent value="invoices">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Invoices</h3>
                <p className="text-sm text-muted-foreground">Track and manage outstanding invoices</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search invoices..." className="w-64 pl-9" />
                </div>
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="icon">
                  <Download className="h-4 w-4" />
                </Button>
                <InvoiceForm />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Invoice</TableHead>
                  <TableHead className="text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-muted-foreground">Amount</TableHead>
                  <TableHead className="text-muted-foreground">Due Date</TableHead>
                  <TableHead className="text-muted-foreground">Status</TableHead>
                  <TableHead className="text-muted-foreground">Days Overdue</TableHead>
                  <TableHead className="text-muted-foreground w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : invoices.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <FileText className="h-8 w-8" />
                        <p>No invoices found</p>
                        <InvoiceForm
                          trigger={
                            <Button variant="outline" size="sm" className="mt-2 gap-2">
                              <Plus className="h-4 w-4" />
                              Create your first invoice
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  invoices.map((invoice) => {
                    const status = invoiceStatusConfig[invoice.status as keyof typeof invoiceStatusConfig] || invoiceStatusConfig.draft;
                    return (
                      <TableRow key={invoice.id} className="border-border">
                        <TableCell className="font-medium text-foreground">
                          {invoice.invoice_number}
                        </TableCell>
                        <TableCell className="text-foreground">{invoice.customer_name}</TableCell>
                        <TableCell className="font-medium text-foreground">
                          ${invoice.total.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {format(new Date(invoice.due_date), "MMM d, yyyy")}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.className)}>
                            {status.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {invoice.days_overdue > 0 ? (
                            <span className="text-destructive font-medium">
                              {invoice.days_overdue} days
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Collections Tab */}
        <TabsContent value="collections">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Customer Balances</h3>
                <p className="text-sm text-muted-foreground">AR aging by customer</p>
              </div>
              <Button variant="outline" className="gap-2">
                <Mail className="h-4 w-4" />
                Send Reminders
              </Button>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-muted-foreground text-right">Total Owed</TableHead>
                  <TableHead className="text-muted-foreground text-right">Current</TableHead>
                  <TableHead className="text-muted-foreground text-right">1-30 Days</TableHead>
                  <TableHead className="text-muted-foreground text-right">31-60 Days</TableHead>
                  <TableHead className="text-muted-foreground text-right">61-90+ Days</TableHead>
                  <TableHead className="text-muted-foreground w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-10 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Users className="h-8 w-8" />
                        <p>No outstanding balances</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  customers.map((customer) => (
                    <TableRow key={customer.id} className="border-border">
                      <TableCell>
                        <div>
                          <p className="font-medium text-foreground">{customer.name}</p>
                          <p className="text-sm text-muted-foreground">{customer.email || "—"}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-semibold text-foreground">
                        ${customer.totalOwed.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-success">
                        ${customer.current.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right text-warning">
                        {customer.overdue30 > 0 ? `$${customer.overdue30.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-orange-500">
                        {customer.overdue60 > 0 ? `$${customer.overdue60.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-right text-destructive">
                        {customer.overdue90 > 0 ? `$${customer.overdue90.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <Mail className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <QuotationForm open={quotationFormOpen} onOpenChange={setQuotationFormOpen} />
    </AppLayout>
  );
};

export default Receivables;
