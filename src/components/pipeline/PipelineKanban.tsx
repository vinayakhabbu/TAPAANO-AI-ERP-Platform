import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  MoreHorizontal,
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  XCircle,
  Calendar,
  DollarSign,
  User,
} from "lucide-react";
import { OPPORTUNITY_STAGES } from "@/hooks/useOpportunities";
import { format } from "date-fns";

interface Opportunity {
  id: string;
  opportunity_name: string;
  opportunity_number: string;
  stage: string;
  expected_value: number;
  probability: number | null;
  expected_close_date: string | null;
  customers?: { name: string } | null;
}

interface PipelineKanbanProps {
  opportunities: Opportunity[] | undefined;
  isLoading: boolean;
  onStageChange: (id: string, stage: string) => void;
}

const PIPELINE_STAGES = OPPORTUNITY_STAGES.filter(
  (s) => !["closed_won", "closed_lost"].includes(s.value)
);

export function PipelineKanban({ opportunities, isLoading, onStageChange }: PipelineKanbanProps) {
  const getOpportunitiesByStage = (stage: string) => {
    return opportunities?.filter((opp) => opp.stage === stage) || [];
  };

  const getStageValue = (stage: string) => {
    return getOpportunitiesByStage(stage).reduce((sum, opp) => sum + opp.expected_value, 0);
  };

  const getNextStage = (currentStage: string) => {
    const stageOrder = ["lead", "qualified", "proposal", "negotiation"];
    const currentIndex = stageOrder.indexOf(currentStage);
    return currentIndex < stageOrder.length - 1 ? stageOrder[currentIndex + 1] : null;
  };

  const getPrevStage = (currentStage: string) => {
    const stageOrder = ["lead", "qualified", "proposal", "negotiation"];
    const currentIndex = stageOrder.indexOf(currentStage);
    return currentIndex > 0 ? stageOrder[currentIndex - 1] : null;
  };

  if (isLoading) {
    return (
      <div className="flex gap-4 overflow-x-auto pb-4">
        {PIPELINE_STAGES.map((stage) => (
          <div key={stage.value} className="min-w-[280px] flex-1">
            <div className="mb-3 flex items-center justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-5 w-16" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-32 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {PIPELINE_STAGES.map((stage) => {
        const stageOpps = getOpportunitiesByStage(stage.value);
        const stageValue = getStageValue(stage.value);

        return (
          <div key={stage.value} className="min-w-[280px] flex-1">
            {/* Stage Header */}
            <div className="mb-3 flex items-center justify-between rounded-lg bg-muted/50 px-3 py-2">
              <div className="flex items-center gap-2">
                <Badge className={cn("font-medium", stage.color)}>{stage.label}</Badge>
                <span className="text-sm text-muted-foreground">({stageOpps.length})</span>
              </div>
              <span className="text-sm font-medium text-foreground">
                ${stageValue.toLocaleString()}
              </span>
            </div>

            {/* Stage Cards */}
            <div className="space-y-3">
              {stageOpps.length === 0 ? (
                <div className="flex h-24 items-center justify-center rounded-lg border border-dashed border-border bg-muted/20">
                  <p className="text-sm text-muted-foreground">No opportunities</p>
                </div>
              ) : (
                stageOpps.map((opp) => {
                  const nextStage = getNextStage(opp.stage);
                  const prevStage = getPrevStage(opp.stage);

                  return (
                    <div
                      key={opp.id}
                      className="group rounded-lg border border-border bg-card p-4 transition-shadow hover:shadow-md"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-foreground truncate">{opp.opportunity_name}</h4>
                          <p className="text-xs text-muted-foreground">{opp.opportunity_number}</p>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {prevStage && (
                              <DropdownMenuItem onClick={() => onStageChange(opp.id, prevStage)}>
                                <ArrowLeft className="h-4 w-4 mr-2" />
                                Move to {OPPORTUNITY_STAGES.find((s) => s.value === prevStage)?.label}
                              </DropdownMenuItem>
                            )}
                            {nextStage && (
                              <DropdownMenuItem onClick={() => onStageChange(opp.id, nextStage)}>
                                <ArrowRight className="h-4 w-4 mr-2" />
                                Move to {OPPORTUNITY_STAGES.find((s) => s.value === nextStage)?.label}
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => onStageChange(opp.id, "closed_won")}>
                              <CheckCircle className="h-4 w-4 mr-2" />
                              Mark as Won
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => onStageChange(opp.id, "closed_lost")}>
                              <XCircle className="h-4 w-4 mr-2" />
                              Mark as Lost
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      <div className="mt-3 space-y-2">
                        {opp.customers?.name && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <User className="h-3.5 w-3.5" />
                            <span className="truncate">{opp.customers.name}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                          <DollarSign className="h-3.5 w-3.5 text-cash" />
                          ${opp.expected_value.toLocaleString()}
                          {opp.probability && (
                            <span className="text-muted-foreground font-normal">
                              ({opp.probability}%)
                            </span>
                          )}
                        </div>
                        {opp.expected_close_date && (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(opp.expected_close_date), "MMM d, yyyy")}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
