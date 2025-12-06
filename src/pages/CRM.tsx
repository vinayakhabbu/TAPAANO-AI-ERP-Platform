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
} from "lucide-react";
import { useOpportunities, useUpdateOpportunityStage, useOpportunityStats, OPPORTUNITY_STAGES } from "@/hooks/useOpportunities";
import { format } from "date-fns";
import { OpportunityForm } from "@/components/forms/OpportunityForm";
import { useToast } from "@/hooks/use-toast";

const CRM = () => {
  const { data: opportunities, isLoading: opportunitiesLoading } = useOpportunities();
  const opportunityStats = useOpportunityStats();
  const updateOpportunityStage = useUpdateOpportunityStage();
  const { toast } = useToast();

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
      <Tabs defaultValue="opportunities" className="mt-6">
        <TabsList className="bg-muted/50">
          <TabsTrigger value="opportunities" className="gap-2">
            <Target className="h-4 w-4" />
            Opportunities
          </TabsTrigger>
          <TabsTrigger value="customers" className="gap-2">
            <Users className="h-4 w-4" />
            Customers
          </TabsTrigger>
        </TabsList>

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

        {/* Customers Tab - placeholder for future */}
        <TabsContent value="customers">
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold text-foreground mb-2">Customer Management</h3>
            <p className="text-muted-foreground">
              Customer management is available in Order to Cash module
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
};

export default CRM;
