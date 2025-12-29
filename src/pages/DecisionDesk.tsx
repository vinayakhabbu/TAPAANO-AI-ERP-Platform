import { useState } from "react";
import { format } from "date-fns";
import { 
  Scale, 
  Search, 
  Filter, 
  ChevronDown, 
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  FileText,
  CreditCard,
  ShoppingCart,
  BookOpen,
  Building2,
  User,
  Calendar
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useDecisionTraces, useDecisionEntities, type DecisionTrace, type DecisionType } from "@/hooks/useDecisionLedger";

const decisionTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  po_approval: { label: "PO Approval", icon: ShoppingCart, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300" },
  po_rejection: { label: "PO Rejection", icon: ShoppingCart, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" },
  payment_approval: { label: "Payment Approval", icon: CreditCard, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300" },
  payment_rejection: { label: "Payment Rejection", icon: CreditCard, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" },
  payment_processing: { label: "Payment Processed", icon: CreditCard, color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300" },
  journal_post: { label: "Journal Posted", icon: BookOpen, color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300" },
  journal_reverse: { label: "Journal Reversed", icon: BookOpen, color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300" },
  bill_status_change: { label: "Bill Status", icon: FileText, color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300" },
  requisition_submit: { label: "Requisition Submitted", icon: FileText, color: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-300" },
  requisition_approval: { label: "Requisition Approved", icon: FileText, color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-300" },
  requisition_rejection: { label: "Requisition Rejected", icon: FileText, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300" },
  invoice_sent: { label: "Invoice Sent", icon: FileText, color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300" },
  invoice_void: { label: "Invoice Voided", icon: FileText, color: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300" },
};

const statusConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  approved: { label: "Approved", icon: CheckCircle2, color: "text-green-600" },
  rejected: { label: "Rejected", icon: XCircle, color: "text-red-600" },
  pending: { label: "Pending", icon: Clock, color: "text-amber-600" },
  auto_approved: { label: "Auto-Approved", icon: CheckCircle2, color: "text-blue-600" },
};

function DecisionCard({ decision }: { decision: DecisionTrace }) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: entities } = useDecisionEntities(isOpen ? decision.id : null);

  const typeConfig = decisionTypeConfig[decision.decision_type] || {
    label: decision.decision_type,
    icon: FileText,
    color: "bg-gray-100 text-gray-800",
  };
  const StatusIcon = statusConfig[decision.approval_status]?.icon || Clock;
  const statusColor = statusConfig[decision.approval_status]?.color || "text-gray-600";
  const TypeIcon = typeConfig.icon;

  const inputSnapshot = decision.input_snapshot as Record<string, unknown>;
  const commitWrites = decision.commit_writes as Array<Record<string, unknown>>;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="mb-3 hover:shadow-md transition-shadow">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <div className={`p-2 rounded-lg ${typeConfig.color}`}>
                  <TypeIcon className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {typeConfig.label}
                    <StatusIcon className={`h-4 w-4 ${statusColor}`} />
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {format(new Date(decision.created_at), "MMM d, yyyy 'at' h:mm a")}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {inputSnapshot?.po_number && (
                  <Badge variant="outline">{String(inputSnapshot.po_number)}</Badge>
                )}
                {inputSnapshot?.run_number && (
                  <Badge variant="outline">{String(inputSnapshot.run_number)}</Badge>
                )}
                {inputSnapshot?.entry_number && (
                  <Badge variant="outline">{String(inputSnapshot.entry_number)}</Badge>
                )}
                {inputSnapshot?.bill_number && (
                  <Badge variant="outline">{String(inputSnapshot.bill_number)}</Badge>
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4 space-y-4">
            {/* State at Decision Time */}
            <div>
              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                <FileText className="h-4 w-4" />
                State at Decision Time
              </h4>
              <div className="bg-muted rounded-lg p-3 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(inputSnapshot).map(([key, value]) => (
                    <div key={key} className="flex justify-between">
                      <span className="text-muted-foreground capitalize">{key.replace(/_/g, " ")}:</span>
                      <span className="font-medium">
                        {typeof value === "number" && key.includes("total")
                          ? `$${value.toLocaleString()}`
                          : String(value ?? "-")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* What Changed */}
            {commitWrites && commitWrites.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Scale className="h-4 w-4" />
                  What Changed
                </h4>
                <div className="space-y-2">
                  {commitWrites.map((write, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-sm bg-muted rounded-lg p-2">
                      <span className="text-muted-foreground">{String(write.entity)}.{String(write.field)}:</span>
                      <Badge variant="outline" className="bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
                        {String(write.before)}
                      </Badge>
                      <span>→</span>
                      <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300">
                        {String(write.after)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rationale */}
            {decision.rationale_text && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Rationale
                </h4>
                <p className="text-sm bg-muted rounded-lg p-3 italic">"{decision.rationale_text}"</p>
              </div>
            )}

            {/* Linked Entities */}
            {entities && entities.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Linked Entities
                </h4>
                <div className="flex flex-wrap gap-2">
                  {entities.map((entity) => (
                    <Badge key={entity.id} variant="secondary">
                      {entity.entity_type}: {entity.entity_label || entity.entity_id.slice(0, 8)}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Approval Info */}
            {decision.approved_at && (
              <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t">
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {format(new Date(decision.approved_at), "MMM d, yyyy 'at' h:mm a")}
                </div>
                <div className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  via {decision.approval_channel}
                </div>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default function DecisionDesk() {
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<DecisionType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: decisions, isLoading } = useDecisionTraces({
    decision_type: typeFilter === "all" ? undefined : typeFilter,
    approval_status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
  });

  const filteredDecisions = decisions?.filter((d) => {
    if (!searchQuery) return true;
    const snapshot = d.input_snapshot as Record<string, unknown>;
    const searchLower = searchQuery.toLowerCase();
    return (
      d.decision_type.toLowerCase().includes(searchLower) ||
      Object.values(snapshot).some((v) => 
        String(v).toLowerCase().includes(searchLower)
      )
    );
  });

  // Stats
  const stats = {
    total: decisions?.length || 0,
    approved: decisions?.filter((d) => d.approval_status === "approved").length || 0,
    rejected: decisions?.filter((d) => d.approval_status === "rejected").length || 0,
    pending: decisions?.filter((d) => d.approval_status === "pending").length || 0,
  };

  return (
    <AppLayout 
      title="Decision Desk" 
      subtitle="Audit trail for all approval decisions and exceptions"
    >
      <div className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Decisions</p>
                  <p className="text-2xl font-bold">{stats.total}</p>
                </div>
                <Scale className="h-8 w-8 text-muted-foreground" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Approved</p>
                  <p className="text-2xl font-bold text-green-600">{stats.approved}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                  <p className="text-2xl font-bold text-red-600">{stats.rejected}</p>
                </div>
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                </div>
                <Clock className="h-8 w-8 text-amber-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search decisions..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as DecisionType | "all")}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Decision Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="po_approval">PO Approval</SelectItem>
                  <SelectItem value="po_rejection">PO Rejection</SelectItem>
                  <SelectItem value="payment_approval">Payment Approval</SelectItem>
                  <SelectItem value="payment_rejection">Payment Rejection</SelectItem>
                  <SelectItem value="payment_processing">Payment Processing</SelectItem>
                  <SelectItem value="journal_post">Journal Post</SelectItem>
                  <SelectItem value="journal_reverse">Journal Reverse</SelectItem>
                  <SelectItem value="bill_status_change">Bill Status</SelectItem>
                  <SelectItem value="requisition_submit">Requisition Submit</SelectItem>
                  <SelectItem value="requisition_approval">Requisition Approval</SelectItem>
                  <SelectItem value="requisition_rejection">Requisition Rejection</SelectItem>
                  <SelectItem value="invoice_sent">Invoice Sent</SelectItem>
                  <SelectItem value="invoice_void">Invoice Void</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
        </Card>

        {/* Decision List */}
        <div>
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Card key={i}>
                  <CardHeader className="py-4">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-lg" />
                      <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : filteredDecisions && filteredDecisions.length > 0 ? (
            filteredDecisions.map((decision) => (
              <DecisionCard key={decision.id} decision={decision} />
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Scale className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No Decisions Yet</h3>
                <p className="text-muted-foreground text-sm">
                  Decision traces will appear here as you approve, reject, or process transactions.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
