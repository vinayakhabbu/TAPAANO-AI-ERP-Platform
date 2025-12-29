import { useState } from "react";
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
  Filter,
  CreditCard,
  MoreHorizontal,
  DollarSign,
  Clock,
  AlertCircle,
  Building2,
  FileText,
  Package,
  Banknote,
  CheckCircle2,
  ArrowRight,
  FileInput,
} from "lucide-react";
import {
  useVendors,
  useBills,
  usePurchaseOrders,
  useGoodsReceipts,
  usePaymentRuns,
  usePayablesSummary,
} from "@/hooks/usePayables";
import {
  usePurchaseRequisitions,
  usePurchaseRequisitionApproval,
} from "@/hooks/usePurchaseRequisitions";
import {
  usePurchaseOrderApproval,
  usePaymentRunApproval,
  useProcessPaymentRun,
} from "@/hooks/useApprovals";
import { ApprovalActions } from "@/components/ApprovalActions";
import { RationaleDialog } from "@/components/RationaleDialog";
import { format } from "date-fns";
import { PurchaseOrderForm } from "@/components/forms/PurchaseOrderForm";
import { GoodsReceiptForm } from "@/components/forms/GoodsReceiptForm";
import { BillForm } from "@/components/forms/BillForm";
import { PaymentRunForm } from "@/components/forms/PaymentRunForm";
import { VendorForm } from "@/components/forms/VendorForm";
import { PurchaseRequisitionForm } from "@/components/forms/PurchaseRequisitionForm";
import { ConvertRequisitionForm } from "@/components/forms/ConvertRequisitionForm";

const billStatusConfig = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  pending: { label: "Pending", className: "bg-warning/10 text-warning" },
  paid: { label: "Paid", className: "bg-success/10 text-success" },
  overdue: { label: "Overdue", className: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

const poStatusConfig = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  pending_approval: { label: "Pending Approval", className: "bg-warning/10 text-warning" },
  approved: { label: "Approved", className: "bg-primary/10 text-primary" },
  partially_received: { label: "Partial", className: "bg-accent/10 text-accent-foreground" },
  received: { label: "Received", className: "bg-success/10 text-success" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

const requisitionStatusConfig = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  pending_approval: { label: "Pending Approval", className: "bg-warning/10 text-warning" },
  approved: { label: "Approved", className: "bg-primary/10 text-primary" },
  rejected: { label: "Rejected", className: "bg-destructive/10 text-destructive" },
  converted: { label: "Converted to PO", className: "bg-success/10 text-success" },
  cancelled: { label: "Cancelled", className: "bg-muted text-muted-foreground" },
};

const priorityConfig = {
  low: { label: "Low", className: "bg-muted text-muted-foreground" },
  normal: { label: "Normal", className: "bg-primary/10 text-primary" },
  high: { label: "High", className: "bg-warning/10 text-warning" },
  urgent: { label: "Urgent", className: "bg-destructive/10 text-destructive" },
};

const paymentRunStatusConfig = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  pending_approval: { label: "Pending Approval", className: "bg-warning/10 text-warning" },
  approved: { label: "Approved", className: "bg-primary/10 text-primary" },
  processing: { label: "Processing", className: "bg-accent/10 text-accent-foreground" },
  completed: { label: "Completed", className: "bg-success/10 text-success" },
  failed: { label: "Failed", className: "bg-destructive/10 text-destructive" },
};

const matchStatusConfig = {
  unmatched: { label: "Unmatched", className: "bg-muted text-muted-foreground" },
  partial: { label: "Partial Match", className: "bg-warning/10 text-warning" },
  matched: { label: "3-Way Matched", className: "bg-success/10 text-success" },
};

const Payables = () => {
  const { data: vendors = [], isLoading: vendorsLoading } = useVendors();
  const { data: bills = [], isLoading: billsLoading } = useBills();
  const { data: purchaseOrders = [], isLoading: posLoading } = usePurchaseOrders();
  const { data: goodsReceipts = [], isLoading: grLoading } = useGoodsReceipts();
  const { data: paymentRuns = [], isLoading: runsLoading } = usePaymentRuns();
  const { data: requisitions = [], isLoading: requisitionsLoading } = usePurchaseRequisitions();
  const summary = usePayablesSummary();

  // Approval mutations
  const poApproval = usePurchaseOrderApproval();
  const paymentRunApproval = usePaymentRunApproval();
  const processPaymentRun = useProcessPaymentRun();
  const requisitionApproval = usePurchaseRequisitionApproval();

  // Requisition rationale dialog state
  const [reqRationaleDialog, setReqRationaleDialog] = useState<{
    open: boolean;
    requisitionId: string;
    action: "approve" | "reject";
  }>({ open: false, requisitionId: "", action: "approve" });

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
    <AppLayout title="Procure-to-Pay" subtitle="Purchase orders, receiving, bills & payments">
      {/* P2P Flow Indicator */}
      <div className="mb-6 flex items-center justify-center gap-2 rounded-lg border border-border bg-card/50 p-3">
        <div className="flex items-center gap-2 text-sm">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <FileInput className="h-4 w-4" />
            <span>Requisition</span>
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5 text-primary">
            <FileText className="h-4 w-4" />
            <span className="font-medium">PO</span>
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Package className="h-4 w-4" />
            <span>Receive</span>
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <DollarSign className="h-4 w-4" />
            <span>Bill</span>
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <CheckCircle2 className="h-4 w-4" />
            <span>Match</span>
          </div>
          <ArrowRight className="h-3 w-3 text-muted-foreground" />
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Banknote className="h-4 w-4" />
            <span>Pay</span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <SummaryCard
          icon={DollarSign}
          label="Total AP"
          value={summary.isLoading ? null : formatCurrency(summary.totalAP)}
          iconBg="bg-primary/10"
          iconColor="text-primary"
        />
        <SummaryCard
          icon={Clock}
          label="Due This Week"
          value={summary.isLoading ? null : formatCurrency(summary.dueThisWeek)}
          iconBg="bg-warning/10"
          iconColor="text-warning"
          valueColor="text-warning"
        />
        <SummaryCard
          icon={AlertCircle}
          label="Overdue"
          value={summary.isLoading ? null : formatCurrency(summary.overdue)}
          iconBg="bg-destructive/10"
          iconColor="text-destructive"
          valueColor="text-destructive"
        />
        <SummaryCard
          icon={FileText}
          label="Open POs"
          value={summary.isLoading ? null : summary.openPOs.toString()}
          iconBg="bg-accent/10"
          iconColor="text-accent-foreground"
        />
        <SummaryCard
          icon={Building2}
          label="Vendors"
          value={summary.isLoading ? null : summary.vendorCount.toString()}
          iconBg="bg-success/10"
          iconColor="text-success"
        />
      </div>

      {/* Tabs for P2P Workflow */}
      <Tabs defaultValue="requisitions" className="mt-6">
        <TabsList className="inline-flex h-10 w-auto">
          <TabsTrigger value="requisitions" className="gap-2">
            <FileInput className="h-4 w-4 hidden sm:inline" />
            Requisitions
          </TabsTrigger>
          <TabsTrigger value="purchase-orders" className="gap-2">
            <FileText className="h-4 w-4 hidden sm:inline" />
            POs
          </TabsTrigger>
          <TabsTrigger value="receiving" className="gap-2">
            <Package className="h-4 w-4 hidden sm:inline" />
            Receiving
          </TabsTrigger>
          <TabsTrigger value="bills" className="gap-2">
            <DollarSign className="h-4 w-4 hidden sm:inline" />
            Bills
          </TabsTrigger>
          <TabsTrigger value="matching" className="gap-2">
            <CheckCircle2 className="h-4 w-4 hidden sm:inline" />
            Matching
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-2">
            <Banknote className="h-4 w-4 hidden sm:inline" />
            Payments
          </TabsTrigger>
        </TabsList>

        {/* Requisitions Tab */}
        <TabsContent value="requisitions" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Purchase Requisitions</h3>
                <p className="text-sm text-muted-foreground">Internal purchase requests before PO creation</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search requisitions..." className="w-full sm:w-64 pl-9" />
                </div>
                <PurchaseRequisitionForm />
              </div>
            </div>

            {requisitionsLoading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : requisitions.length === 0 ? (
              <EmptyState
                icon={FileInput}
                title="No requisitions"
                description="Create purchase requisitions to request materials or services"
                actionButton={<PurchaseRequisitionForm trigger={<Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />New Requisition</Button>} />}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Requisition #</TableHead>
                    <TableHead className="text-muted-foreground">Department</TableHead>
                    <TableHead className="text-muted-foreground">Required Date</TableHead>
                    <TableHead className="text-muted-foreground">Priority</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requisitions.map((req) => {
                    const status = requisitionStatusConfig[req.status];
                    const priority = priorityConfig[req.priority];
                    return (
                      <TableRow key={req.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{req.requisition_number}</TableCell>
                        <TableCell className="text-foreground">{req.department || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {req.required_date ? formatDate(req.required_date) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", priority.className)}>{priority.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.className)}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            {req.status === "draft" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => requisitionApproval.mutate({ id: req.id, action: "submit" })}
                                disabled={requisitionApproval.isPending}
                              >
                                Submit
                              </Button>
                            )}
                            {req.status === "pending_approval" && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setReqRationaleDialog({ open: true, requisitionId: req.id, action: "approve" })}
                                  disabled={requisitionApproval.isPending}
                                >
                                  Approve
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setReqRationaleDialog({ open: true, requisitionId: req.id, action: "reject" })}
                                  disabled={requisitionApproval.isPending}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            {req.status === "approved" && (
                              <ConvertRequisitionForm requisition={req} />
                            )}
                            {(req.status === "converted" || req.status === "rejected" || req.status === "cancelled") && (
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Purchase Orders Tab */}
        <TabsContent value="purchase-orders" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Purchase Orders</h3>
                <p className="text-sm text-muted-foreground">Create and manage POs to vendors</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search POs..." className="w-full sm:w-64 pl-9" />
                </div>
                <VendorForm />
                <PurchaseOrderForm />
              </div>
            </div>

            {posLoading ? (
              <TableSkeleton rows={5} cols={6} />
            ) : purchaseOrders.length === 0 ? (
              <EmptyState
                icon={FileText}
                title="No purchase orders"
                description="Create your first PO to start the procure-to-pay cycle"
                actionButton={<PurchaseOrderForm trigger={<Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />New Purchase Order</Button>} />}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">PO #</TableHead>
                    <TableHead className="text-muted-foreground">Vendor</TableHead>
                    <TableHead className="text-muted-foreground">Order Date</TableHead>
                    <TableHead className="text-muted-foreground">Expected</TableHead>
                    <TableHead className="text-muted-foreground">Total</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchaseOrders.map((po) => {
                    const status = poStatusConfig[po.status];
                    return (
                      <TableRow key={po.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{po.po_number}</TableCell>
                        <TableCell className="text-foreground">{po.vendor?.name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(po.order_date)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {po.expected_delivery_date ? formatDate(po.expected_delivery_date) : "—"}
                        </TableCell>
                        <TableCell className="font-medium text-foreground">{formatCurrency(po.total)}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.className)}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <ApprovalActions
                            documentType="purchase_order"
                            documentId={po.id}
                            currentStatus={po.status}
                            onSubmitForApproval={() => poApproval.mutate({ id: po.id, action: "submit_for_approval" })}
                            onApprove={(rationale) => poApproval.mutate({ id: po.id, action: "approve", rationale })}
                            onReject={(rationale) => poApproval.mutate({ id: po.id, action: "reject", rationale })}
                            isLoading={poApproval.isPending}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </TabsContent>

        {/* Receiving Tab */}
        <TabsContent value="receiving" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Goods Receipts</h3>
                <p className="text-sm text-muted-foreground">Track received goods against POs</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search receipts..." className="w-full sm:w-64 pl-9" />
                </div>
                <GoodsReceiptForm />
              </div>
            </div>

            {grLoading ? (
              <TableSkeleton rows={5} cols={4} />
            ) : goodsReceipts.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No goods receipts"
                description="Record received goods when PO deliveries arrive"
                actionButton={<GoodsReceiptForm trigger={<Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />Receive Goods</Button>} />}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Receipt #</TableHead>
                    <TableHead className="text-muted-foreground">PO Reference</TableHead>
                    <TableHead className="text-muted-foreground">Receipt Date</TableHead>
                    <TableHead className="text-muted-foreground">Notes</TableHead>
                    <TableHead className="text-muted-foreground w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {goodsReceipts.map((gr) => (
                    <TableRow key={gr.id} className="border-border">
                      <TableCell className="font-medium text-foreground">{gr.receipt_number}</TableCell>
                      <TableCell className="text-muted-foreground">{gr.purchase_order_id.slice(0, 8)}...</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(gr.receipt_date)}</TableCell>
                      <TableCell className="text-muted-foreground">{gr.notes || "—"}</TableCell>
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

        {/* Bills Tab */}
        <TabsContent value="bills" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Vendor Bills</h3>
                <p className="text-sm text-muted-foreground">Track and pay vendor invoices</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="relative flex-1 sm:flex-none">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search bills..." className="w-full sm:w-64 pl-9" />
                </div>
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
                <BillForm />
              </div>
            </div>

            {billsLoading ? (
              <TableSkeleton rows={5} cols={7} />
            ) : bills.length === 0 ? (
              <EmptyState
                icon={DollarSign}
                title="No bills"
                description="Enter vendor bills to track and pay"
                actionButton={<BillForm trigger={<Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />New Bill</Button>} />}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Bill #</TableHead>
                    <TableHead className="text-muted-foreground">Vendor</TableHead>
                    <TableHead className="text-muted-foreground">Due Date</TableHead>
                    <TableHead className="text-muted-foreground">Total</TableHead>
                    <TableHead className="text-muted-foreground">Balance</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground">Match</TableHead>
                    <TableHead className="text-muted-foreground w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bills.map((bill) => {
                    const status = billStatusConfig[bill.status] || billStatusConfig.pending;
                    const matchStatus = matchStatusConfig[(bill.match_status as keyof typeof matchStatusConfig) || "unmatched"];
                    const balance = bill.total - bill.amount_paid;
                    return (
                      <TableRow key={bill.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{bill.bill_number}</TableCell>
                        <TableCell className="text-foreground">{bill.vendor?.name || "—"}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(bill.due_date)}</TableCell>
                        <TableCell className="font-medium text-foreground">{formatCurrency(bill.total)}</TableCell>
                        <TableCell className="text-muted-foreground">{formatCurrency(balance)}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.className)}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn("font-medium", matchStatus.className)}>
                            {matchStatus.label}
                          </Badge>
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

        {/* Matching Tab */}
        <TabsContent value="matching" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">3-Way Matching</h3>
                <p className="text-sm text-muted-foreground">Match PO → Receipt → Bill for payment approval</p>
              </div>
              <Button variant="outline" className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Auto-Match
              </Button>
            </div>

            {billsLoading ? (
              <TableSkeleton rows={5} cols={5} />
            ) : (
              <div className="p-6">
                <div className="grid gap-4 md:grid-cols-3">
                  <MatchingCard
                    title="Unmatched Bills"
                    count={bills.filter(b => b.match_status === "unmatched" || !b.match_status).length}
                    description="Bills without PO or receipt"
                    color="text-muted-foreground"
                  />
                  <MatchingCard
                    title="Partial Matches"
                    count={bills.filter(b => b.match_status === "partial").length}
                    description="Missing PO or receipt"
                    color="text-warning"
                  />
                  <MatchingCard
                    title="Fully Matched"
                    count={bills.filter(b => b.match_status === "matched").length}
                    description="Ready for payment"
                    color="text-success"
                  />
                </div>
                
                {bills.length === 0 && (
                  <EmptyState
                    icon={CheckCircle2}
                    title="No bills to match"
                    description="Create POs and bills to start 3-way matching"
                    actionButton={<BillForm trigger={<Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />Create Bill</Button>} />}
                  />
                )}
              </div>
            )}
          </div>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="mt-4">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Payment Runs</h3>
                <p className="text-sm text-muted-foreground">Batch payments with approval workflow</p>
              </div>
              <div className="flex items-center gap-3">
                <Button variant="outline" className="gap-2">
                  <CreditCard className="h-4 w-4" />
                  <span className="hidden sm:inline">Quick Pay</span>
                </Button>
                <PaymentRunForm />
              </div>
            </div>

            {runsLoading ? (
              <TableSkeleton rows={5} cols={5} />
            ) : paymentRuns.length === 0 ? (
              <EmptyState
                icon={Banknote}
                title="No payment runs"
                description="Create a payment run to batch-pay vendor bills"
                actionButton={<PaymentRunForm trigger={<Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />Create Payment Run</Button>} />}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Run #</TableHead>
                    <TableHead className="text-muted-foreground">Date</TableHead>
                    <TableHead className="text-muted-foreground">Method</TableHead>
                    <TableHead className="text-muted-foreground">Total</TableHead>
                    <TableHead className="text-muted-foreground">Status</TableHead>
                    <TableHead className="text-muted-foreground w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paymentRuns.map((run) => {
                    const status = paymentRunStatusConfig[run.status];
                    return (
                      <TableRow key={run.id} className="border-border">
                        <TableCell className="font-medium text-foreground">{run.run_number}</TableCell>
                        <TableCell className="text-muted-foreground">{formatDate(run.run_date)}</TableCell>
                        <TableCell className="text-muted-foreground uppercase">{run.payment_method || "ACH"}</TableCell>
                        <TableCell className="font-medium text-foreground">{formatCurrency(run.total_amount)}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", status.className)}>{status.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <ApprovalActions
                            documentType="payment_run"
                            documentId={run.id}
                            currentStatus={run.status}
                            onSubmitForApproval={() => paymentRunApproval.mutate({ id: run.id, action: "submit_for_approval" })}
                            onApprove={(rationale) => paymentRunApproval.mutate({ id: run.id, action: "approve", rationale })}
                            onReject={(rationale) => paymentRunApproval.mutate({ id: run.id, action: "reject", rationale })}
                            onProcess={(rationale) => processPaymentRun.mutate({ id: run.id, rationale })}
                            isLoading={paymentRunApproval.isPending || processPaymentRun.isPending}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Vendors Section */}
          <div className="mt-6 rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Vendors</h3>
                <p className="text-sm text-muted-foreground">Manage vendor relationships</p>
              </div>
              <VendorForm />
            </div>

            {vendorsLoading ? (
              <TableSkeleton rows={3} cols={4} />
            ) : vendors.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="No vendors"
                description="Add vendors to create POs and track bills"
                actionButton={<VendorForm trigger={<Button variant="outline" className="gap-2"><Plus className="h-4 w-4" />Add Vendor</Button>} />}
              />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead className="text-muted-foreground">Vendor</TableHead>
                    <TableHead className="text-muted-foreground">Email</TableHead>
                    <TableHead className="text-muted-foreground">Payment Terms</TableHead>
                    <TableHead className="text-muted-foreground w-12"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vendors.map((vendor) => (
                    <TableRow key={vendor.id} className="border-border">
                      <TableCell className="font-medium text-foreground">{vendor.name}</TableCell>
                      <TableCell className="text-muted-foreground">{vendor.email || "—"}</TableCell>
                      <TableCell className="text-muted-foreground">Net {vendor.payment_terms || 30}</TableCell>
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
      </Tabs>

      {/* Requisition Rationale Dialog */}
      <RationaleDialog
        open={reqRationaleDialog.open}
        onOpenChange={(open) => setReqRationaleDialog((prev) => ({ ...prev, open }))}
        title={reqRationaleDialog.action === "approve" ? "Approve Requisition" : "Reject Requisition"}
        description={
          reqRationaleDialog.action === "approve"
            ? "Provide a reason for approving this requisition. This will be recorded in the decision ledger."
            : "Provide a reason for rejecting this requisition. It will be returned to the requester."
        }
        actionLabel={reqRationaleDialog.action === "approve" ? "Approve" : "Reject"}
        actionVariant={reqRationaleDialog.action === "approve" ? "default" : "destructive"}
        onConfirm={(rationale) => {
          requisitionApproval.mutate({
            id: reqRationaleDialog.requisitionId,
            action: reqRationaleDialog.action,
            rationale,
            rejection_reason: reqRationaleDialog.action === "reject" ? rationale : undefined,
          });
          setReqRationaleDialog((prev) => ({ ...prev, open: false }));
        }}
        isLoading={requisitionApproval.isPending}
      />
    </AppLayout>
  );
};

// Helper Components
interface SummaryCardProps {
  icon: React.ElementType;
  label: string;
  value: string | null;
  iconBg: string;
  iconColor: string;
  valueColor?: string;
}

const SummaryCard = ({ icon: Icon, label, value, iconBg, iconColor, valueColor = "text-foreground" }: SummaryCardProps) => (
  <div className="rounded-xl border border-border bg-card p-4">
    <div className="flex items-center gap-3">
      <div className={cn("rounded-lg p-2", iconBg)}>
        <Icon className={cn("h-4 w-4", iconColor)} />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        {value === null ? (
          <Skeleton className="h-6 w-20 mt-1" />
        ) : (
          <p className={cn("text-lg font-bold", valueColor)}>{value}</p>
        )}
      </div>
    </div>
  </div>
);

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description: string;
  actionButton?: React.ReactNode;
}

const EmptyState = ({ icon: Icon, title, description, actionButton }: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-12 text-center">
    <div className="rounded-full bg-muted p-3 mb-4">
      <Icon className="h-6 w-6 text-muted-foreground" />
    </div>
    <h4 className="font-medium text-foreground">{title}</h4>
    <p className="text-sm text-muted-foreground mt-1 max-w-sm">{description}</p>
    <div className="mt-4">
      {actionButton}
    </div>
  </div>
);

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

interface MatchingCardProps {
  title: string;
  count: number;
  description: string;
  color: string;
}

const MatchingCard = ({ title, count, description, color }: MatchingCardProps) => (
  <div className="rounded-lg border border-border p-4 text-center">
    <p className={cn("text-3xl font-bold", color)}>{count}</p>
    <p className="font-medium text-foreground mt-1">{title}</p>
    <p className="text-xs text-muted-foreground">{description}</p>
  </div>
);

export default Payables;
