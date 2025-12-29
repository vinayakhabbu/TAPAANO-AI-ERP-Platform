import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  AlertTriangle, 
  AlertCircle, 
  Info, 
  ShieldAlert,
  RefreshCw,
  Clock,
  TrendingUp,
  Repeat,
  Timer,
  Moon
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Anomaly {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  detected_value: number | string;
  expected_range?: string;
  detected_at: string;
  metadata?: Record<string, unknown>;
}

interface AnomalySummary {
  total: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
}

const severityConfig = {
  critical: { icon: ShieldAlert, color: "text-red-600", bg: "bg-red-100", badge: "destructive" as const },
  high: { icon: AlertTriangle, color: "text-orange-600", bg: "bg-orange-100", badge: "destructive" as const },
  medium: { icon: AlertCircle, color: "text-yellow-600", bg: "bg-yellow-100", badge: "secondary" as const },
  low: { icon: Info, color: "text-blue-600", bg: "bg-blue-100", badge: "outline" as const },
};

const typeIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  high_value_transaction: TrendingUp,
  rapid_approvals: Clock,
  duplicate_pattern: Repeat,
  override_pattern: AlertTriangle,
  stalled_approval: Timer,
  unusual_timing: Moon,
};

export function AnomalyDetector() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["anomaly-detection"],
    queryFn: async () => {
      const { data: profile } = await supabase.auth.getUser();
      if (!profile.user) throw new Error("Not authenticated");

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", profile.user.id)
        .single();

      const { data: result, error } = await supabase.functions.invoke("anomaly-detector", {
        body: { org_id: userProfile?.org_id },
      });

      if (error) throw error;
      return result as { anomalies: Anomaly[]; summary: AnomalySummary; scanned_at: string };
    },
    refetchInterval: 5 * 60 * 1000, // Refresh every 5 minutes
  });

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  };

  const summary = data?.summary || { total: 0, critical: 0, high: 0, medium: 0, low: 0 };
  const anomalies = data?.anomalies || [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Anomaly Detection</h3>
          <p className="text-sm text-muted-foreground">
            AI-powered pattern analysis to flag unusual activity
          </p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleRefresh}
          disabled={isLoading || isRefreshing}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", (isLoading || isRefreshing) && "animate-spin")} />
          Scan Now
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="border-border">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold">{summary.total}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </CardContent>
        </Card>
        <Card className="border-red-200 bg-red-50/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-red-600">{summary.critical}</div>
            <div className="text-xs text-red-600">Critical</div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-orange-600">{summary.high}</div>
            <div className="text-xs text-orange-600">High</div>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-yellow-600">{summary.medium}</div>
            <div className="text-xs text-yellow-600">Medium</div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-3 text-center">
            <div className="text-2xl font-bold text-blue-600">{summary.low}</div>
            <div className="text-xs text-blue-600">Low</div>
          </CardContent>
        </Card>
      </div>

      {/* Anomaly List */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Detected Anomalies</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Scanning for anomalies...</span>
            </div>
          ) : anomalies.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ShieldAlert className="h-12 w-12 mx-auto mb-2 opacity-20" />
              <p>No anomalies detected</p>
              <p className="text-xs">All patterns appear normal</p>
            </div>
          ) : (
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {anomalies.map((anomaly) => {
                  const config = severityConfig[anomaly.severity];
                  const SeverityIcon = config.icon;
                  const TypeIcon = typeIcons[anomaly.type] || AlertCircle;

                  return (
                    <div
                      key={anomaly.id}
                      className={cn(
                        "p-3 rounded-lg border",
                        config.bg,
                        "border-border/50"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <div className={cn("p-2 rounded-lg", config.bg)}>
                          <SeverityIcon className={cn("h-4 w-4", config.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant={config.badge} className="text-xs">
                              {anomaly.severity}
                            </Badge>
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <TypeIcon className="h-3 w-3" />
                              {anomaly.type.replace(/_/g, " ")}
                            </span>
                          </div>
                          <h4 className="font-medium text-sm">{anomaly.title}</h4>
                          <p className="text-xs text-muted-foreground mt-1">
                            {anomaly.description}
                          </p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                            <span>Entity: {anomaly.entity_label}</span>
                            {anomaly.expected_range && (
                              <span>Expected: {anomaly.expected_range}</span>
                            )}
                            <span>Detected: {String(anomaly.detected_value)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Last Scan Info */}
      {data?.scanned_at && (
        <p className="text-xs text-muted-foreground text-center">
          Last scan: {new Date(data.scanned_at).toLocaleString()}
        </p>
      )}
    </div>
  );
}
