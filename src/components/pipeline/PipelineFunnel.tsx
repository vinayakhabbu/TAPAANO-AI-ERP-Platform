import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { OPPORTUNITY_STAGES } from "@/hooks/useOpportunities";

interface Opportunity {
  id: string;
  opportunity_name: string;
  stage: string;
  expected_value: number;
  probability: number | null;
}

interface PipelineFunnelProps {
  opportunities: Opportunity[] | undefined;
  isLoading: boolean;
}

const FUNNEL_STAGES = OPPORTUNITY_STAGES.filter(
  (s) => !["closed_won", "closed_lost"].includes(s.value)
);

export function PipelineFunnel({ opportunities, isLoading }: PipelineFunnelProps) {
  const getStageData = (stage: string) => {
    const stageOpps = opportunities?.filter((opp) => opp.stage === stage) || [];
    const count = stageOpps.length;
    const value = stageOpps.reduce((sum, opp) => sum + opp.expected_value, 0);
    const weightedValue = stageOpps.reduce(
      (sum, opp) => sum + opp.expected_value * ((opp.probability || 0) / 100),
      0
    );
    return { count, value, weightedValue };
  };

  const allStageData = FUNNEL_STAGES.map((stage) => ({
    ...stage,
    ...getStageData(stage.value),
  }));

  const maxCount = Math.max(...allStageData.map((s) => s.count), 1);
  const totalValue = allStageData.reduce((sum, s) => sum + s.value, 0);

  // Won/Lost stats
  const wonOpps = opportunities?.filter((opp) => opp.stage === "closed_won") || [];
  const lostOpps = opportunities?.filter((opp) => opp.stage === "closed_lost") || [];
  const wonValue = wonOpps.reduce((sum, opp) => sum + opp.expected_value, 0);
  const lostValue = lostOpps.reduce((sum, opp) => sum + opp.expected_value, 0);

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Funnel Visualization */}
      <div className="space-y-2">
        {allStageData.map((stage, index) => {
          const widthPercent = 100 - index * 12; // Gradually narrow the funnel
          const fillPercent = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;

          return (
            <div key={stage.value} className="relative">
              <div
                className="mx-auto rounded-lg border border-border bg-muted/30 p-4 transition-all hover:bg-muted/50"
                style={{ width: `${widthPercent}%` }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        "h-10 w-10 rounded-lg flex items-center justify-center text-lg font-bold",
                        stage.color
                      )}
                    >
                      {stage.count}
                    </div>
                    <div>
                      <h4 className="font-medium text-foreground">{stage.label}</h4>
                      <p className="text-sm text-muted-foreground">
                        ${stage.value.toLocaleString()} total value
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-foreground">
                      ${stage.weightedValue.toLocaleString()}
                    </p>
                    <p className="text-sm text-muted-foreground">weighted</p>
                  </div>
                </div>
                {/* Progress bar inside */}
                <div className="mt-3 h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", stage.color.replace("text-", "bg-").split(" ")[0])}
                    style={{ width: `${fillPercent}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Pipeline</p>
          <p className="text-2xl font-bold text-foreground">${totalValue.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">
            {allStageData.reduce((sum, s) => sum + s.count, 0)} opportunities
          </p>
        </div>
        <div className="rounded-xl border border-success/30 bg-success/5 p-4">
          <p className="text-sm text-success">Won Deals</p>
          <p className="text-2xl font-bold text-success">${wonValue.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">{wonOpps.length} closed won</p>
        </div>
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">Lost Deals</p>
          <p className="text-2xl font-bold text-destructive">${lostValue.toLocaleString()}</p>
          <p className="text-sm text-muted-foreground mt-1">{lostOpps.length} closed lost</p>
        </div>
      </div>

      {/* Conversion Rates */}
      <div className="rounded-xl border border-border bg-card p-4">
        <h4 className="font-medium text-foreground mb-4">Stage Conversion</h4>
        <div className="flex items-center justify-between gap-2 overflow-x-auto">
          {allStageData.map((stage, index) => {
            const nextStage = allStageData[index + 1];
            const conversionRate = nextStage && stage.count > 0
              ? Math.round((nextStage.count / stage.count) * 100)
              : null;

            return (
              <div key={stage.value} className="flex items-center gap-2">
                <div className="text-center min-w-[80px]">
                  <p className="text-xs text-muted-foreground">{stage.label}</p>
                  <p className="text-lg font-bold text-foreground">{stage.count}</p>
                </div>
                {conversionRate !== null && (
                  <div className="flex flex-col items-center px-2">
                    <span className="text-xs text-muted-foreground">→</span>
                    <span className="text-xs font-medium text-primary">{conversionRate}%</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
