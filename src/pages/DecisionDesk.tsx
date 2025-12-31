import { useState } from "react";
import { format, subDays } from "date-fns";
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
  Calendar,
  Download,
  BarChart3,
  Zap,
  Bot,
  ShieldAlert,
  History,
  GitBranch,
  TrendingUp,
  Network,
  Play
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDecisionTraces, useDecisionEntities, type DecisionTrace, type DecisionType } from "@/hooks/useDecisionLedger";
import { useToast } from "@/hooks/use-toast";
import { PolicyAnalyticsChart } from "@/components/decisions/PolicyAnalyticsChart";
import { AutonomousApprover } from "@/components/decisions/AutonomousApprover";
import { AnomalyDetector } from "@/components/decisions/AnomalyDetector";
import { PrecedentExplorer } from "@/components/decisions/PrecedentExplorer";
import { AgentRunPlayback } from "@/components/decisions/AgentRunPlayback";
import { EntityGraph } from "@/components/decisions/EntityGraph";
import { PrecedentCheckbox } from "@/components/decisions/PrecedentCheckbox";

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

interface PrecedentRef {
  decision_id: string;
  similarity: number;
  note?: string;
}

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
  
  // Get precedents_referenced from the decision (stored as JSONB)
  const rawPrecedents = (decision as any).precedents_referenced;
  const precedentsReferenced: PrecedentRef[] = Array.isArray(rawPrecedents) ? rawPrecedents : [];

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
                {decision.approval_channel === "auto" && (
                  <Badge variant="secondary" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300">
                    <Zap className="h-3 w-3 mr-1" />
                    Auto
                  </Badge>
                )}
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
                {inputSnapshot?.requisition_number && (
                  <Badge variant="outline">{String(inputSnapshot.requisition_number)}</Badge>
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

            {/* Referenced Precedents */}
            {precedentsReferenced.length > 0 && (
              <div>
                <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                  <GitBranch className="h-4 w-4" />
                  Precedents Consulted
                  <Badge variant="secondary" className="text-xs">{precedentsReferenced.length}</Badge>
                </h4>
                <div className="space-y-2">
                  {precedentsReferenced.map((precedent, idx) => (
                    <div 
                      key={precedent.decision_id || idx} 
                      className="flex items-center justify-between bg-muted rounded-lg p-2 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <History className="h-4 w-4 text-muted-foreground" />
                        <span className="text-muted-foreground">
                          {precedent.note || `Decision ${precedent.decision_id.slice(0, 8)}...`}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs">
                        <TrendingUp className={`h-3 w-3 ${
                          precedent.similarity >= 0.8 ? "text-green-600" : 
                          precedent.similarity >= 0.6 ? "text-amber-600" : "text-muted-foreground"
                        }`} />
                        <span className={
                          precedent.similarity >= 0.8 ? "text-green-600 font-medium" : 
                          precedent.similarity >= 0.6 ? "text-amber-600" : "text-muted-foreground"
                        }>
                          {Math.round(precedent.similarity * 100)}% match
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
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

            {/* Approval Info + Precedent Toggle */}
            <div className="flex items-center justify-between pt-2 border-t">
              {decision.approved_at && (
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
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
              <PrecedentCheckbox
                decisionId={decision.id}
                isPrecedent={(decision as any).is_precedent || false}
                precedentScope={(decision as any).precedent_scope}
                precedentNotes={(decision as any).precedent_notes}
              />
            </div>
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
  const [dateRange, setDateRange] = useState<string>("all");
  const { toast } = useToast();

  const { data: decisions, isLoading } = useDecisionTraces({
    decision_type: typeFilter === "all" ? undefined : typeFilter,
    approval_status: statusFilter === "all" ? undefined : statusFilter,
    limit: 100,
  });

  // Filter by date range
  const getDateFilteredDecisions = () => {
    if (!decisions) return [];
    if (dateRange === "all") return decisions;
    
    const now = new Date();
    let cutoff: Date;
    
    switch (dateRange) {
      case "today":
        cutoff = new Date(now.setHours(0, 0, 0, 0));
        break;
      case "week":
        cutoff = subDays(now, 7);
        break;
      case "month":
        cutoff = subDays(now, 30);
        break;
      case "quarter":
        cutoff = subDays(now, 90);
        break;
      default:
        return decisions;
    }
    
    return decisions.filter((d) => new Date(d.created_at) >= cutoff);
  };

  const dateFilteredDecisions = getDateFilteredDecisions();

  const filteredDecisions = dateFilteredDecisions.filter((d) => {
    if (!searchQuery) return true;
    const snapshot = d.input_snapshot as Record<string, unknown>;
    const searchLower = searchQuery.toLowerCase();
    return (
      d.decision_type.toLowerCase().includes(searchLower) ||
      d.rationale_text?.toLowerCase().includes(searchLower) ||
      Object.values(snapshot).some((v) => 
        String(v).toLowerCase().includes(searchLower)
      )
    );
  });

  // Export to CSV
  const exportToCSV = () => {
    if (!filteredDecisions.length) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }

    const headers = [
      "Date",
      "Decision Type",
      "Status",
      "Document Reference",
      "Amount",
      "Rationale",
      "Reason Codes",
    ];

    const rows = filteredDecisions.map((d) => {
      const snapshot = d.input_snapshot as Record<string, unknown>;
      const docRef = snapshot.po_number || snapshot.run_number || snapshot.entry_number || snapshot.requisition_number || "-";
      const amount = snapshot.total || snapshot.estimated_total || "-";
      
      return [
        format(new Date(d.created_at), "yyyy-MM-dd HH:mm"),
        decisionTypeConfig[d.decision_type]?.label || d.decision_type,
        d.approval_status,
        String(docRef),
        typeof amount === "number" ? `$${amount.toLocaleString()}` : String(amount),
        d.rationale_text || "-",
        d.reason_codes?.join("; ") || "-",
      ];
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `decision-audit-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();

    toast({ title: "Export complete", description: `Exported ${filteredDecisions.length} decisions` });
  };

  // Stats
  const autoApprovedCount = dateFilteredDecisions.filter((d) => d.approval_channel === "auto").length;
  const stats = {
    total: dateFilteredDecisions.length,
    approved: dateFilteredDecisions.filter((d) => d.approval_status === "approved").length,
    rejected: dateFilteredDecisions.filter((d) => d.approval_status === "rejected").length,
    pending: dateFilteredDecisions.filter((d) => d.approval_status === "pending").length,
    autoApproved: autoApprovedCount,
    autoApprovalRate: dateFilteredDecisions.length > 0 
      ? Math.round((autoApprovedCount / dateFilteredDecisions.length) * 100) 
      : 0,
  };

  return (
    <AppLayout 
      title="Decision Desk" 
      subtitle="Audit trail for all approval decisions and exceptions"
    >
      <div className="space-y-6">
        {/* Summary Stats - Compact Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Card className="group hover:shadow-md transition-all duration-200 border-l-4 border-l-muted-foreground/20">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-muted group-hover:bg-muted/80 transition-colors">
                  <Scale className="h-5 w-5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight">{stats.total}</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="group hover:shadow-md transition-all duration-200 border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950 group-hover:bg-green-100 dark:group-hover:bg-green-900 transition-colors">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight text-green-600">{stats.approved}</p>
                  <p className="text-xs text-muted-foreground">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="group hover:shadow-md transition-all duration-200 border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-red-50 dark:bg-red-950 group-hover:bg-red-100 dark:group-hover:bg-red-900 transition-colors">
                  <XCircle className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight text-red-600">{stats.rejected}</p>
                  <p className="text-xs text-muted-foreground">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="group hover:shadow-md transition-all duration-200 border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950 group-hover:bg-amber-100 dark:group-hover:bg-amber-900 transition-colors">
                  <Clock className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight text-amber-600">{stats.pending}</p>
                  <p className="text-xs text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="group hover:shadow-md transition-all duration-200 border-l-4 border-l-blue-500 col-span-2 sm:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950 group-hover:bg-blue-100 dark:group-hover:bg-blue-900 transition-colors">
                  <Bot className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold tracking-tight text-blue-600">{stats.autoApproved}</p>
                  <p className="text-xs text-muted-foreground">{stats.autoApprovalRate}% Auto</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="decisions" className="space-y-4">
          <Card className="p-1.5">
            <div className="overflow-x-auto scrollbar-hide">
              <TabsList className="inline-flex w-max min-w-full h-auto p-0 gap-1 bg-transparent">
                <TabsTrigger 
                  value="decisions" 
                  className="flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
                >
                  <FileText className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline font-medium">Decision Log</span>
                  <span className="sm:hidden font-medium">Log</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="precedents" 
                  className="flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
                >
                  <History className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline font-medium">Precedents</span>
                  <span className="sm:hidden font-medium">Prec.</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="agent-runs" 
                  className="flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
                >
                  <Play className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline font-medium">Agent Runs</span>
                  <span className="sm:hidden font-medium">Runs</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="graph" 
                  className="flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
                >
                  <Network className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline font-medium">Entity Graph</span>
                  <span className="sm:hidden font-medium">Graph</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="autonomous" 
                  className="flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
                >
                  <Bot className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline font-medium">Auto Approver</span>
                  <span className="sm:hidden font-medium">Auto</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="anomalies" 
                  className="flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
                >
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline font-medium">Anomalies</span>
                  <span className="sm:hidden font-medium">Alert</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="analytics" 
                  className="flex items-center gap-2 whitespace-nowrap px-4 py-2.5 rounded-lg data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm transition-all"
                >
                  <BarChart3 className="h-4 w-4 shrink-0" />
                  <span className="hidden sm:inline font-medium">Analytics</span>
                  <span className="sm:hidden font-medium">Stats</span>
                </TabsTrigger>
              </TabsList>
            </div>
          </Card>

          {/* Precedent Explorer Tab */}
          <TabsContent value="precedents">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  Find Similar Cases
                </CardTitle>
                <CardDescription>
                  Search for precedents to understand how similar decisions were handled in the past
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PrecedentExplorer />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Agent Runs Tab */}
          <TabsContent value="agent-runs">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Play className="h-5 w-5" />
                  Agent Execution Timeline
                </CardTitle>
                <CardDescription>
                  View step-by-step playback of autonomous agent runs
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AgentRunPlayback />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Entity Graph Tab */}
          <TabsContent value="graph">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="h-5 w-5" />
                  Entity Relationship Graph
                </CardTitle>
                <CardDescription>
                  Visualize relationships between decisions and entities
                </CardDescription>
              </CardHeader>
              <CardContent>
                <EntityGraph />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="decisions" className="space-y-4">
            {/* Filters */}
            <Card className="shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col lg:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by type, rationale, or content..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10 bg-muted/50 border-0 focus-visible:bg-background focus-visible:ring-1"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as DecisionType | "all")}>
                      <SelectTrigger className="w-[160px] bg-muted/50 border-0">
                        <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Type" />
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
                      <SelectTrigger className="w-[130px] bg-muted/50 border-0">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={dateRange} onValueChange={setDateRange}>
                      <SelectTrigger className="w-[140px] bg-muted/50 border-0">
                        <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                        <SelectValue placeholder="Time" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Time</SelectItem>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="week">Last 7 Days</SelectItem>
                        <SelectItem value="month">Last 30 Days</SelectItem>
                        <SelectItem value="quarter">Last 90 Days</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      variant="outline" 
                      size="icon" 
                      onClick={exportToCSV} 
                      title="Export to CSV"
                      className="bg-muted/50 border-0 hover:bg-muted"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Decision List */}
            <div className="space-y-3">
              {isLoading ? (
                <>
                  {[1, 2, 3].map((i) => (
                    <Card key={i} className="animate-pulse">
                      <CardHeader className="py-4">
                        <div className="flex items-center gap-4">
                          <Skeleton className="h-12 w-12 rounded-xl" />
                          <div className="space-y-2 flex-1">
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-3 w-28" />
                          </div>
                          <Skeleton className="h-6 w-20 rounded-full" />
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </>
              ) : filteredDecisions && filteredDecisions.length > 0 ? (
                filteredDecisions.map((decision) => (
                  <DecisionCard key={decision.id} decision={decision} />
                ))
              ) : (
                <Card className="border-dashed">
                  <CardContent className="py-16 text-center">
                    <div className="mx-auto w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-6">
                      <Scale className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-xl font-semibold mb-2">No Decisions Yet</h3>
                    <p className="text-muted-foreground text-sm max-w-md mx-auto mb-6">
                      Decision traces will appear here as you approve, reject, or process transactions across the system.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="gap-1">
                        <ShoppingCart className="h-3 w-3" /> Purchase Orders
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        <CreditCard className="h-3 w-3" /> Payments
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        <BookOpen className="h-3 w-3" /> Journal Entries
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        <FileText className="h-3 w-3" /> Invoices
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="autonomous">
            <AutonomousApprover />
          </TabsContent>

          <TabsContent value="anomalies">
            <AnomalyDetector />
          </TabsContent>

          <TabsContent value="analytics">
            <PolicyAnalyticsChart decisions={decisions || []} />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
