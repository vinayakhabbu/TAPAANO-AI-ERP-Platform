import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  Bot, 
  Play, 
  Pause, 
  RefreshCw, 
  CheckCircle2, 
  AlertTriangle,
  ShoppingCart,
  CreditCard,
  FileText,
  Zap,
  Shield
} from "lucide-react";

interface AutoApprovalCandidate {
  id: string;
  type: "purchase_order" | "payment_run" | "purchase_requisition";
  identifier: string;
  amount: number;
  confidence: number;
  factors: {
    policyPassed: boolean;
    precedentStrength: number;
    amountWithinLimit: boolean;
    riskLevel: string;
  };
  canAutoApprove: boolean;
  reason: string;
}

interface ProcessingResult {
  processed: number;
  autoApproved: number;
  routed: number;
  errors: number;
  candidates: AutoApprovalCandidate[];
}

const typeIcons: Record<string, React.ElementType> = {
  purchase_order: ShoppingCart,
  payment_run: CreditCard,
  purchase_requisition: FileText,
};

const typeLabels: Record<string, string> = {
  purchase_order: "Purchase Order",
  payment_run: "Payment Run",
  purchase_requisition: "Requisition",
};

export function AutonomousApprover() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [autoProcessingEnabled, setAutoProcessingEnabled] = useState(false);

  // Preview pending approvals
  const { data: preview, isLoading: previewLoading, refetch } = useQuery({
    queryKey: ["autonomous-preview", profile?.org_id],
    queryFn: async () => {
      if (!profile?.org_id) return null;

      const { data, error } = await supabase.functions.invoke("autonomous-approver", {
        body: { org_id: profile.org_id, mode: "preview" },
      });

      if (error) throw error;
      return data as ProcessingResult;
    },
    enabled: !!profile?.org_id,
    refetchInterval: autoProcessingEnabled ? 30000 : false,
  });

  // Execute autonomous approvals
  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!profile?.org_id) throw new Error("No organization");

      const { data, error } = await supabase.functions.invoke("autonomous-approver", {
        body: { org_id: profile.org_id, mode: "execute" },
      });

      if (error) throw error;
      return data as ProcessingResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["autonomous-preview"] });
      queryClient.invalidateQueries({ queryKey: ["decision-traces"] });
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      queryClient.invalidateQueries({ queryKey: ["payment_runs"] });
      queryClient.invalidateQueries({ queryKey: ["purchase_requisitions"] });
      
      toast({
        title: "Autonomous Processing Complete",
        description: `${result.autoApproved} auto-approved, ${result.routed} routed for review`,
      });
    },
    onError: (error) => {
      toast({
        title: "Processing Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const eligibleCount = preview?.candidates.filter(c => c.canAutoApprove).length || 0;
  const routedCount = preview?.candidates.filter(c => !c.canAutoApprove).length || 0;

  return (
    <div className="space-y-6">
      {/* Control Panel */}
      <Card className="bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950 dark:to-blue-950 border-indigo-200 dark:border-indigo-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                <Bot className="h-6 w-6 text-indigo-600" />
              </div>
              <div>
                <CardTitle>Autonomous Approver</CardTitle>
                <CardDescription>AI-powered batch processing for low-risk approvals</CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch
                  id="auto-mode"
                  checked={autoProcessingEnabled}
                  onCheckedChange={setAutoProcessingEnabled}
                />
                <Label htmlFor="auto-mode" className="text-sm">
                  {autoProcessingEnabled ? "Auto-refresh ON" : "Manual mode"}
                </Label>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={previewLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${previewLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                onClick={() => executeMutation.mutate()}
                disabled={executeMutation.isPending || eligibleCount === 0}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {executeMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Execute ({eligibleCount})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-background rounded-lg">
              <p className="text-3xl font-bold text-indigo-600">{preview?.processed || 0}</p>
              <p className="text-sm text-muted-foreground">Pending Items</p>
            </div>
            <div className="text-center p-4 bg-background rounded-lg">
              <p className="text-3xl font-bold text-green-600">{eligibleCount}</p>
              <p className="text-sm text-muted-foreground">Ready for Auto-Approve</p>
            </div>
            <div className="text-center p-4 bg-background rounded-lg">
              <p className="text-3xl font-bold text-amber-600">{routedCount}</p>
              <p className="text-sm text-muted-foreground">Needs Human Review</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Candidates Preview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Approval Candidates
          </CardTitle>
          <CardDescription>
            Preview what the autonomous approver will process
          </CardDescription>
        </CardHeader>
        <CardContent>
          {previewLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading candidates...</div>
          ) : preview?.candidates.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
              <p>No pending approvals</p>
            </div>
          ) : (
            <div className="space-y-3">
              {preview?.candidates.map((candidate) => {
                const Icon = typeIcons[candidate.type] || FileText;
                return (
                  <div
                    key={candidate.id}
                    className={`p-4 rounded-lg border ${
                      candidate.canAutoApprove
                        ? "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                        : "bg-amber-50 border-amber-200 dark:bg-amber-950 dark:border-amber-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${
                          candidate.canAutoApprove 
                            ? "bg-green-100 dark:bg-green-900" 
                            : "bg-amber-100 dark:bg-amber-900"
                        }`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{candidate.identifier}</span>
                            <Badge variant="outline" className="text-xs">
                              {typeLabels[candidate.type]}
                            </Badge>
                            {candidate.canAutoApprove && (
                              <Badge className="bg-green-600 text-xs">
                                <Zap className="h-3 w-3 mr-1" />
                                Auto-Eligible
                              </Badge>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            ${candidate.amount.toLocaleString()} • {candidate.reason}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium">Confidence</span>
                          <span className={`text-lg font-bold ${
                            candidate.confidence >= 75 ? "text-green-600" :
                            candidate.confidence >= 50 ? "text-amber-600" : "text-red-600"
                          }`}>
                            {candidate.confidence}%
                          </span>
                        </div>
                        <Progress 
                          value={candidate.confidence} 
                          className="w-24 h-2"
                        />
                      </div>
                    </div>
                    
                    {/* Factor breakdown */}
                    <div className="mt-3 flex gap-4 text-xs">
                      <span className={candidate.factors.policyPassed ? "text-green-600" : "text-red-600"}>
                        {candidate.factors.policyPassed ? "✓" : "✗"} Policy
                      </span>
                      <span className={candidate.factors.amountWithinLimit ? "text-green-600" : "text-red-600"}>
                        {candidate.factors.amountWithinLimit ? "✓" : "✗"} Amount Limit
                      </span>
                      <span className={candidate.factors.precedentStrength >= 70 ? "text-green-600" : "text-amber-600"}>
                        Precedent: {candidate.factors.precedentStrength}%
                      </span>
                      <span className={
                        candidate.factors.riskLevel === "low" ? "text-green-600" :
                        candidate.factors.riskLevel === "medium" ? "text-amber-600" : "text-red-600"
                      }>
                        Risk: {candidate.factors.riskLevel}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
