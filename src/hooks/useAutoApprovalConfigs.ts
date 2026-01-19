import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface AutoApprovalConfig {
  id: string;
  org_id: string;
  decision_type: string;
  min_precedent_similarity: number;
  min_precedent_count: number;
  max_auto_approval_amount: number;
  enabled: boolean;
}

// Default configs as fallback
const DEFAULT_CONFIGS: Record<string, Omit<AutoApprovalConfig, "id" | "org_id">> = {
  po_approval: {
    decision_type: "po_approval",
    min_precedent_similarity: 0.75,
    min_precedent_count: 2,
    max_auto_approval_amount: 5000,
    enabled: true,
  },
  payment_approval: {
    decision_type: "payment_approval",
    min_precedent_similarity: 0.80,
    min_precedent_count: 3,
    max_auto_approval_amount: 10000,
    enabled: true,
  },
  requisition_approval: {
    decision_type: "requisition_approval",
    min_precedent_similarity: 0.70,
    min_precedent_count: 2,
    max_auto_approval_amount: 3000,
    enabled: true,
  },
  journal_post: {
    decision_type: "journal_post",
    min_precedent_similarity: 0.85,
    min_precedent_count: 3,
    max_auto_approval_amount: Infinity,
    enabled: true,
  },
};

export function useAutoApprovalConfigs() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["auto-approval-configs", profile?.org_id],
    queryFn: async () => {
      if (!profile?.org_id) return null;
      
      const { data, error } = await supabase
        .from("auto_approval_configs")
        .select("*")
        .eq("org_id", profile.org_id);
      
      if (error) throw error;
      
      // Convert array to map by decision_type
      const configMap: Record<string, AutoApprovalConfig> = {};
      for (const config of (data || [])) {
        configMap[config.decision_type] = config as AutoApprovalConfig;
      }
      
      return configMap;
    },
    enabled: !!profile?.org_id,
  });
}

export function useAutoApprovalConfig(decisionType: string) {
  const { data: configs, isLoading } = useAutoApprovalConfigs();

  const config = configs?.[decisionType] || null;
  const fallback = DEFAULT_CONFIGS[decisionType] || {
    decision_type: decisionType,
    min_precedent_similarity: 0.80,
    min_precedent_count: 3,
    max_auto_approval_amount: 0,
    enabled: false,
  };

  return {
    config: config || fallback,
    isLoading,
    isFromDatabase: !!config,
  };
}

/**
 * Get config for auto-approval evaluation
 * Returns a simplified config object compatible with existing evaluation logic
 */
export function getConfigForEvaluation(
  configs: Record<string, AutoApprovalConfig> | null | undefined,
  decisionType: string
) {
  const config = configs?.[decisionType];
  
  if (!config) {
    const fallback = DEFAULT_CONFIGS[decisionType];
    return fallback || {
      minPrecedentSimilarity: 0.80,
      minPrecedentCount: 3,
      maxAutoApprovalAmount: 0,
      enabled: false,
    };
  }

  return {
    minPrecedentSimilarity: config.min_precedent_similarity,
    minPrecedentCount: config.min_precedent_count,
    maxAutoApprovalAmount: config.max_auto_approval_amount,
    enabled: config.enabled,
  };
}
