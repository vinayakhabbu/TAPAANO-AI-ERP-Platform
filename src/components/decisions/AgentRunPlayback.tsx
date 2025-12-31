import { useState } from "react";
import { format } from "date-fns";
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  ChevronRight,
  ChevronDown,
  Zap,
  Bot,
  FileText,
  Search,
  ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAgentRuns, useAgentRunWithSteps, type AgentRun, type AgentRunStep } from "@/hooks/useAgentRuns";

const runTypeConfig: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  autonomous_approver: { label: "Autonomous Approver", icon: Bot, color: "bg-blue-100 text-blue-800" },
  anomaly_detector: { label: "Anomaly Detector", icon: Search, color: "bg-amber-100 text-amber-800" },
  precedent_search: { label: "Precedent Search", icon: FileText, color: "bg-purple-100 text-purple-800" },
};

const statusConfig: Record<string, { icon: React.ElementType; color: string }> = {
  running: { icon: Loader2, color: "text-blue-600" },
  completed: { icon: CheckCircle2, color: "text-green-600" },
  failed: { icon: XCircle, color: "text-red-600" },
  pending: { icon: Clock, color: "text-amber-600" },
};

function StepTimeline({ steps }: { steps: AgentRunStep[] }) {
  if (!steps.length) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        No execution steps recorded
      </div>
    );
  }

  return (
    <div className="relative pl-6 space-y-4">
      {/* Timeline line */}
      <div className="absolute left-2 top-2 bottom-2 w-0.5 bg-border" />
      
      {steps.map((step, idx) => {
        const status = statusConfig[step.step_status] || statusConfig.pending;
        const StatusIcon = status.icon;
        const isLast = idx === steps.length - 1;

        return (
          <div key={step.id} className="relative">
            {/* Timeline dot */}
            <div className={`absolute -left-4 top-1 w-4 h-4 rounded-full border-2 bg-background flex items-center justify-center ${
              step.step_status === "completed" ? "border-green-600" :
              step.step_status === "failed" ? "border-red-600" :
              step.step_status === "running" ? "border-blue-600" : "border-muted"
            }`}>
              <StatusIcon className={`h-2.5 w-2.5 ${status.color} ${step.step_status === "running" ? "animate-spin" : ""}`} />
            </div>

            <div className="bg-muted rounded-lg p-3 ml-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    Step {step.step_number}
                  </Badge>
                  <span className="font-medium text-sm">{step.step_name}</span>
                </div>
                {step.duration_ms && (
                  <span className="text-xs text-muted-foreground">
                    {step.duration_ms}ms
                  </span>
                )}
              </div>
              
              <div className="text-xs text-muted-foreground mt-1">
                {step.step_type}
              </div>

              {/* Input/Output preview */}
              {(Object.keys(step.input_data).length > 0 || Object.keys(step.output_data).length > 0) && (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  {Object.keys(step.input_data).length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Input:</span>
                      <pre className="mt-1 p-1 bg-background rounded text-xs overflow-hidden truncate">
                        {JSON.stringify(step.input_data).slice(0, 50)}...
                      </pre>
                    </div>
                  )}
                  {Object.keys(step.output_data).length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Output:</span>
                      <pre className="mt-1 p-1 bg-background rounded text-xs overflow-hidden truncate">
                        {JSON.stringify(step.output_data).slice(0, 50)}...
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {step.error_message && (
                <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 rounded text-xs text-red-600 dark:text-red-400">
                  {step.error_message}
                </div>
              )}

              {step.started_at && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {format(new Date(step.started_at), "h:mm:ss a")}
                  {step.completed_at && (
                    <>
                      <ArrowRight className="inline h-3 w-3 mx-1" />
                      {format(new Date(step.completed_at), "h:mm:ss a")}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RunCard({ run, isExpanded, onToggle }: { 
  run: AgentRun; 
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const { data: runWithSteps, isLoading } = useAgentRunWithSteps(isExpanded ? run.id : null);
  
  const config = runTypeConfig[run.run_type] || {
    label: run.run_type,
    icon: Zap,
    color: "bg-gray-100 text-gray-800",
  };
  const TypeIcon = config.icon;
  const status = statusConfig[run.run_status] || statusConfig.pending;
  const StatusIcon = status.icon;

  const duration = run.completed_at 
    ? Math.round((new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000)
    : null;

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className="hover:shadow-md transition-shadow">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <div className={`p-2 rounded-lg ${config.color}`}>
                  <TypeIcon className="h-4 w-4" />
                </div>
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {config.label}
                    <StatusIcon className={`h-4 w-4 ${status.color} ${run.run_status === "running" ? "animate-spin" : ""}`} />
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {format(new Date(run.started_at), "MMM d, yyyy 'at' h:mm:ss a")}
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {duration !== null && (
                  <Badge variant="outline" className="text-xs">
                    {duration}s
                  </Badge>
                )}
                {run.trigger_source && (
                  <Badge variant="secondary" className="text-xs">
                    {run.trigger_source}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-4">
            {run.result_summary && (
              <div className="mb-4 p-3 bg-muted rounded-lg text-sm">
                {run.result_summary}
              </div>
            )}
            
            {run.error_message && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 rounded-lg text-sm text-red-600 dark:text-red-400">
                {run.error_message}
              </div>
            )}

            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
              <Play className="h-4 w-4" />
              Execution Timeline
            </h4>
            
            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : (
              <StepTimeline steps={runWithSteps?.steps || []} />
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export function AgentRunPlayback() {
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const { data: runs, isLoading } = useAgentRuns({ limit: 20 });

  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <Bot className="h-12 w-12 mx-auto mb-3 opacity-50" />
          <p className="font-medium">No Agent Runs Yet</p>
          <p className="text-sm mt-1">
            Agent runs will appear here when autonomous processes execute
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ScrollArea className="h-[600px]">
      <div className="space-y-3 pr-4">
        {runs.map((run) => (
          <RunCard
            key={run.id}
            run={run}
            isExpanded={expandedRunId === run.id}
            onToggle={() => setExpandedRunId(expandedRunId === run.id ? null : run.id)}
          />
        ))}
      </div>
    </ScrollArea>
  );
}