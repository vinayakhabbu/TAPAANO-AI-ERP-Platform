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
  MoreHorizontal,
  Target,
  TrendingUp,
  CheckCircle,
  XCircle,
  FileText,
  ArrowRight,
  Users,
  DollarSign,
  Award,
  Mail,
  Phone,
  LayoutGrid,
  BarChart3,
} from "lucide-react";
import { useOpportunities, useUpdateOpportunityStage, useOpportunityStats, OPPORTUNITY_STAGES } from "@/hooks/useOpportunities";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { OpportunityForm } from "@/components/forms/OpportunityForm";
import { CustomerForm } from "@/components/forms/CustomerForm";
import { useToast } from "@/hooks/use-toast";
import { PipelineKanban } from "@/components/pipeline/PipelineKanban";
import { PipelineFunnel } from "@/components/pipeline/PipelineFunnel";
import { SalesForecasting } from "@/components/forecasting/SalesForecasting";
import { SalesAnalytics } from "@/components/analytics/SalesAnalytics";


const CRM = () => {
  const [pipelineView, setPipelineView] = useState<"kanban" | "funnel">("kanban");
  const { data: opportunities, isLoading: opportunitiesLoading } = useOpportunities();
  const opportunityStats = useOpportunityStats();
  const updateOpportunityStage = useUpdateOpportunityStage();
  const { toast } = useToast();

  const { data: customers, isLoading: customersLoading } = useQuery({
    queryKey: ["customers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .order("name", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const customerStats = {
    total: customers?.length || 0,
  };

  const handleOpportunityStageUpdate = async (id: string, stage: string) => {
    try {
      await updateOpportunityStage.mutateAsync({ id, stage });
      toast({ title: "Stage Updated", description: `Opportunity moved to ${stage.replace("_", " ")}` });
    } catch {
      toast({ title: "Error", description: "Failed to update stage", variant: "destructive" });
    }
  };

  return (
    <AppLayout title="CRM" subtitle="Customer relationship management">
      {/* Summary Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-primary/10 p-2.5">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Open Opportunities</p>
              {opportunitiesLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold text-foreground">{opportunityStats.open}</p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-cash/10 p-2.5">
              <DollarSign className="h-5 w-5 text-cash" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pipeline Value</p>
              {opportunitiesLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold text-foreground">
                  ${opportunityStats.totalValue.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-warning/10 p-2.5">
              <TrendingUp className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Weighted Value</p>
              {opportunitiesLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <p className="text-2xl font-bold text-foreground">
                  ${opportunityStats.weightedValue.toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="rounded-lg bg-success/10 p-2.5">
              <Award className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Won This Period</p>
              {opportunitiesLoading ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <p className="text-2xl font-bold text-success">{opportunityStats.won}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pipeline" className="mt-6">
        <TabsList className="h-auto flex-wrap gap-1 p-1 bg-muted/50">
          <TabsTrigger value="pipeline" className="gap-2 text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Pipeline</span>
            <span className="sm:hidden">Pipe</span>
          </TabsTrigger>
          <TabsTrigger value="opportunities" className="gap-2 text-xs sm:text-sm">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">Opportunities</span>
            <span className="sm:hidden">Opps</span>
          </TabsTrigger>
          <TabsTrigger value="customers" className="gap-2 text-xs sm:text-sm">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Customers</span>
            <span className="sm:hidden">Custs</span>
          </TabsTrigger>
          <TabsTrigger value="forecasting" className="gap-2 text-xs sm:text-sm">
            <TrendingUp className="h-4 w-4" />
            <span className="hidden sm:inline">Forecasting</span>
            <span className="sm:hidden">Fcast</span>
          </TabsTrigger>
          <TabsTrigger value="analytics" className="gap-2 text-xs sm:text-sm">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Analytics</span>
            <span className="sm:hidden">Stats</span>
          </TabsTrigger>
        </TabsList>

        {/* Pipeline Tab */}
        <TabsContent value="pipeline" className="mt-6">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Sales Pipeline</h3>
                <p className="text-sm text-muted-foreground">
                  Visualize your opportunities through the sales stages
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex rounded-lg border border-border p-1">
                  <Button
                    variant={pipelineView === "kanban" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setPipelineView("kanban")}
                    className="gap-2"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Kanban
                  </Button>
                  <Button
                    variant={pipelineView === "funnel" ? "secondary" : "ghost"}
                    size="sm"
                    onClick={() => setPipelineView("funnel")}
                    className="gap-2"
                  >
                    <BarChart3 className="h-4 w-4" />
                    Funnel
                  </Button>
                </div>
                <OpportunityForm />
              </div>
            </div>

            <div className="p-4">
              {pipelineView === "kanban" ? (
                <PipelineKanban
                  opportunities={opportunities}
                  isLoading={opportunitiesLoading}
                  onStageChange={handleOpportunityStageUpdate}
                />
              ) : (
                <PipelineFunnel
                  opportunities={opportunities}
                  isLoading={opportunitiesLoading}
                />
              )}
            </div>
          </div>
        </TabsContent>

        {/* Opportunities Tab */}
        <TabsContent value="opportunities">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Sales Opportunities</h3>
                <p className="text-sm text-muted-foreground">
                  Track and manage your sales pipeline
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search opportunities..." className="w-64 pl-9" />
                </div>
                <OpportunityForm />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Opportunity</TableHead>
                  <TableHead className="text-muted-foreground">Customer</TableHead>
                  <TableHead className="text-muted-foreground">Stage</TableHead>
                  <TableHead className="text-muted-foreground text-right">Value</TableHead>
                  <TableHead className="text-muted-foreground">Probability</TableHead>
                  <TableHead className="text-muted-foreground">Close Date</TableHead>
                  <TableHead className="text-muted-foreground w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {opportunitiesLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                    </TableRow>
                  ))
                ) : !opportunities || opportunities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Target className="h-8 w-8" />
                        <p>No opportunities found</p>
                        <OpportunityForm
                          trigger={
                            <Button variant="outline" size="sm" className="mt-2 gap-2">
                              <Plus className="h-4 w-4" />
                              Create your first opportunity
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  opportunities.map((opp) => {
                    const stageConfig = OPPORTUNITY_STAGES.find((s) => s.value === opp.stage) || OPPORTUNITY_STAGES[0];
                    return (
                      <TableRow key={opp.id} className="border-border">
                        <TableCell>
                          <div>
                            <p className="font-medium text-foreground">{opp.opportunity_name}</p>
                            <p className="text-xs text-muted-foreground">{opp.opportunity_number}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-foreground">{opp.customers?.name || "—"}</TableCell>
                        <TableCell>
                          <Badge className={cn("font-medium", stageConfig.color)}>
                            {stageConfig.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium text-foreground">
                          ${opp.expected_value.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{opp.probability}%</TableCell>
                        <TableCell className="text-muted-foreground">
                          {opp.expected_close_date
                            ? format(new Date(opp.expected_close_date), "MMM d, yyyy")
                            : "—"}
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {opp.stage === "lead" && (
                                <DropdownMenuItem onClick={() => handleOpportunityStageUpdate(opp.id, "qualified")}>
                                  <TrendingUp className="h-4 w-4 mr-2" /> Move to Qualified
                                </DropdownMenuItem>
                              )}
                              {opp.stage === "qualified" && (
                                <DropdownMenuItem onClick={() => handleOpportunityStageUpdate(opp.id, "proposal")}>
                                  <FileText className="h-4 w-4 mr-2" /> Move to Proposal
                                </DropdownMenuItem>
                              )}
                              {opp.stage === "proposal" && (
                                <DropdownMenuItem onClick={() => handleOpportunityStageUpdate(opp.id, "negotiation")}>
                                  <ArrowRight className="h-4 w-4 mr-2" /> Move to Negotiation
                                </DropdownMenuItem>
                              )}
                              {opp.stage === "negotiation" && (
                                <>
                                  <DropdownMenuItem onClick={() => handleOpportunityStageUpdate(opp.id, "closed_won")}>
                                    <CheckCircle className="h-4 w-4 mr-2" /> Mark as Won
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleOpportunityStageUpdate(opp.id, "closed_lost")}>
                                    <XCircle className="h-4 w-4 mr-2" /> Mark as Lost
                                  </DropdownMenuItem>
                                </>
                              )}
                              {!["closed_won", "closed_lost"].includes(opp.stage) && (
                                <>
                                  <DropdownMenuItem onClick={() => handleOpportunityStageUpdate(opp.id, "closed_won")}>
                                    <CheckCircle className="h-4 w-4 mr-2" /> Mark as Won
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleOpportunityStageUpdate(opp.id, "closed_lost")}>
                                    <XCircle className="h-4 w-4 mr-2" /> Mark as Lost
                                  </DropdownMenuItem>
                                </>
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

        {/* Customers Tab */}
        <TabsContent value="customers">
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <div>
                <h3 className="text-lg font-semibold text-foreground">Customers</h3>
                <p className="text-sm text-muted-foreground">
                  Manage your customer database ({customerStats.total} total)
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input placeholder="Search customers..." className="w-64 pl-9" />
                </div>
                <CustomerForm />
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground">Email</TableHead>
                  <TableHead className="text-muted-foreground">Phone</TableHead>
                  <TableHead className="text-muted-foreground text-right">Credit Limit</TableHead>
                  <TableHead className="text-muted-foreground">Payment Terms</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customersLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : !customers || customers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-32 text-center">
                      <div className="flex flex-col items-center gap-2 text-muted-foreground">
                        <Users className="h-8 w-8" />
                        <p>No customers found</p>
                        <CustomerForm
                          trigger={
                            <Button variant="outline" size="sm" className="mt-2 gap-2">
                              <Plus className="h-4 w-4" />
                              Add your first customer
                            </Button>
                          }
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  customers.map((customer) => (
                    <TableRow key={customer.id} className="border-border">
                      <TableCell className="font-medium text-foreground">{customer.name}</TableCell>
                      <TableCell>
                        {customer.email ? (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Mail className="h-3.5 w-3.5" />
                            {customer.email}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {customer.phone ? (
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Phone className="h-3.5 w-3.5" />
                            {customer.phone}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium text-foreground">
                        {customer.credit_limit ? `$${customer.credit_limit.toLocaleString()}` : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {customer.payment_terms ? `Net ${customer.payment_terms}` : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Forecasting Tab */}
        <TabsContent value="forecasting">
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-4">
              <h3 className="text-lg font-semibold text-foreground">Sales Forecasting</h3>
              <p className="text-sm text-muted-foreground">
                Pipeline projections, trends, and target tracking
              </p>
            </div>
            <div className="p-4">
              <SalesForecasting />
            </div>
          </div>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics">
          <div className="rounded-xl border border-border bg-card">
            <div className="border-b border-border p-4">
              <h3 className="text-lg font-semibold text-foreground">Sales Analytics</h3>
              <p className="text-sm text-muted-foreground">
                Performance metrics, trends, and pipeline insights
              </p>
            </div>
            <div className="p-4">
              <SalesAnalytics />
            </div>
          </div>
        </TabsContent>

      </Tabs>
    </AppLayout>
  );
};

export default CRM;
