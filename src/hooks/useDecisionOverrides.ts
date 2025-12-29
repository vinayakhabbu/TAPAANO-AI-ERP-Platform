import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface DecisionOverride {
  id: string;
  org_id: string;
  original_decision_id: string;
  override_type: "revoke_approval" | "force_reject" | "force_approve";
  decision_type: string;
  source_type: string;
  source_id: string | null;
  original_confidence: number | null;
  override_reason: string;
  overridden_by: string | null;
  overridden_at: string;
  learned: boolean;
  learned_at: string | null;
  created_at: string;
}

export interface ConfidenceAdjustment {
  id: string;
  org_id: string;
  decision_type: string;
  source_type: string;
  adjustment_factor: number;
  override_count: number;
  last_calculated_at: string;
}

// Get the current confidence adjustment for a decision type
export const useConfidenceAdjustment = (decisionType: string, sourceType: string) => {
  return useQuery({
    queryKey: ["confidence-adjustment", decisionType, sourceType],
    queryFn: async () => {
      const { data: profile } = await supabase.auth.getUser();
      if (!profile.user) return null;

      const { data: userProfile } = await supabase
        .from("profiles")
        .select("org_id")
        .eq("id", profile.user.id)
        .single();

      if (!userProfile?.org_id) return null;

      const { data } = await supabase
        .from("confidence_adjustments")
        .select("*")
        .eq("org_id", userProfile.org_id)
        .eq("decision_type", decisionType)
        .eq("source_type", sourceType)
        .single();

      return data as ConfidenceAdjustment | null;
    },
    enabled: !!decisionType && !!sourceType,
  });
};

// Get override history for a decision type
export const useDecisionOverrides = (filters?: {
  decision_type?: string;
  source_type?: string;
  limit?: number;
}) => {
  return useQuery({
    queryKey: ["decision-overrides", filters],
    queryFn: async () => {
      let query = supabase
        .from("decision_overrides")
        .select("*, decision_traces!original_decision_id(*)")
        .order("overridden_at", { ascending: false });

      if (filters?.decision_type) {
        query = query.eq("decision_type", filters.decision_type);
      }
      if (filters?.source_type) {
        query = query.eq("source_type", filters.source_type);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as (DecisionOverride & { decision_traces: unknown })[];
    },
  });
};

// Record an override and trigger learning
export const useRecordOverride = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      originalDecisionId,
      overrideType,
      reason,
    }: {
      originalDecisionId: string;
      overrideType: "revoke_approval" | "force_reject" | "force_approve";
      reason: string;
    }) => {
      // Get the original decision
      const { data: decision, error: fetchError } = await supabase
        .from("decision_traces")
        .select("*")
        .eq("id", originalDecisionId)
        .single();

      if (fetchError || !decision) {
        throw new Error("Decision not found");
      }

      const { data: user } = await supabase.auth.getUser();

      // Extract confidence from input_snapshot if available
      const inputSnapshot = decision.input_snapshot as Record<string, unknown>;
      const autoApprovalData = inputSnapshot?.auto_approval as Record<string, unknown> | undefined;
      const originalConfidence = autoApprovalData?.confidence as number | undefined;

      // Insert the override record
      const { error: insertError } = await supabase
        .from("decision_overrides")
        .insert({
          org_id: decision.org_id,
          original_decision_id: originalDecisionId,
          override_type: overrideType,
          decision_type: decision.decision_type,
          source_type: decision.source_type,
          source_id: decision.source_id,
          original_confidence: originalConfidence,
          override_reason: reason,
          overridden_by: user.user?.id,
        });

      if (insertError) throw insertError;

      // Recalculate confidence adjustment for this decision type
      await recalculateConfidenceAdjustment(
        decision.org_id,
        decision.decision_type,
        decision.source_type || ""
      );

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decision-overrides"] });
      queryClient.invalidateQueries({ queryKey: ["confidence-adjustment"] });
      toast({
        title: "Override Recorded",
        description: "The system will learn from this decision to improve future auto-approvals.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to record override",
        variant: "destructive",
      });
    },
  });
};

// Recalculate confidence adjustment based on override history
async function recalculateConfidenceAdjustment(
  orgId: string,
  decisionType: string,
  sourceType: string
) {
  // Get all overrides for this decision type
  const { data: overrides } = await supabase
    .from("decision_overrides")
    .select("override_type, original_confidence")
    .eq("org_id", orgId)
    .eq("decision_type", decisionType)
    .eq("source_type", sourceType);

  if (!overrides || overrides.length === 0) return;

  // Calculate adjustment factor based on overrides
  // Each revoke/reject reduces confidence, force_approve increases it
  let adjustmentSum = 0;
  for (const override of overrides) {
    if (override.override_type === "revoke_approval" || override.override_type === "force_reject") {
      // Negative adjustment: reduce auto-approval confidence
      adjustmentSum -= 5; // 5% reduction per override
    } else if (override.override_type === "force_approve") {
      // Positive adjustment: increase confidence slightly
      adjustmentSum += 2; // 2% increase per force approve
    }
  }

  // Cap adjustment between -30% and +10%
  const adjustmentFactor = Math.max(-30, Math.min(10, adjustmentSum));

  // Upsert the adjustment record
  const { error } = await supabase
    .from("confidence_adjustments")
    .upsert(
      {
        org_id: orgId,
        decision_type: decisionType,
        source_type: sourceType,
        adjustment_factor: adjustmentFactor,
        override_count: overrides.length,
        last_calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "org_id,decision_type,source_type" }
    );

  if (error) {
    console.error("Failed to update confidence adjustment:", error);
  }

  // Mark overrides as learned
  await supabase
    .from("decision_overrides")
    .update({ learned: true, learned_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("decision_type", decisionType)
    .eq("source_type", sourceType)
    .eq("learned", false);
}

// Get learning stats for display
export const useLearningStats = () => {
  return useQuery({
    queryKey: ["learning-stats"],
    queryFn: async () => {
      const { data: overrides } = await supabase
        .from("decision_overrides")
        .select("decision_type, override_type, learned");

      const { data: adjustments } = await supabase
        .from("confidence_adjustments")
        .select("*");

      const stats = {
        totalOverrides: overrides?.length || 0,
        learnedOverrides: overrides?.filter((o) => o.learned).length || 0,
        adjustmentsByType: adjustments?.reduce(
          (acc, adj) => {
            acc[adj.decision_type] = {
              adjustment: adj.adjustment_factor,
              overrideCount: adj.override_count,
            };
            return acc;
          },
          {} as Record<string, { adjustment: number; overrideCount: number }>
        ) || {},
      };

      return stats;
    },
  });
};
