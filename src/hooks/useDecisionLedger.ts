import { useMutation, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { PolicyEvaluation } from "@/lib/policyRules";

export type DecisionType =
  | "po_approval" | "po_rejection" | "requisition_approval" | "requisition_rejection"
  | "requisition_submit" | "payment_approval" | "payment_rejection" | "payment_processing"
  | "bill_status_change" | "journal_post" | "journal_reverse" | "invoice_sent"
  | "invoice_void" | "invoice_paid" | "quotation_sent" | "quotation_accepted"
  | "quotation_rejected" | "quotation_converted" | "sales_order_status_change"
  | "opportunity_stage_change" | "stock_transfer_created" | "stock_transfer_completed"
  | "cycle_count_completed" | "inventory_receipt_posted" | "inventory_adjustment"
  | "time_off_approval" | "time_off_rejection" | "expense_claim_approval"
  | "expense_claim_rejection" | "expense_claim_paid" | "payroll_run_processed"
  | "service_call_status_change" | "service_contract_renewal"
  | "production_order_status_change" | "production_goods_receipt"
  | "credit_override" | "discount_override";

export interface PrecedentReference {
  decision_id: string;
  similarity: number;
  note?: string;
}

export interface DecisionTraceInput {
  decision_type: DecisionType;
  source_type: string;
  source_id: string;
  input_snapshot: Record<string, unknown>;
  policy_evaluation?: PolicyEvaluation;
  precedents_referenced?: PrecedentReference[];
  reason_codes?: string[];
  rationale_text?: string;
  approval_channel?: "auto" | "human" | "escalated";
  commit_writes?: Array<{
    entity: string;
    id: string;
    field: string;
    before: unknown;
    after: unknown;
  }>;
  entities?: Array<{
    entity_type: string;
    entity_id: string;
    entity_label?: string;
    entity_snapshot?: Record<string, unknown>;
  }>;
}

export interface DecisionTrace {
  id: string;
  org_id: string;
  decision_type: string;
  agent_run_id: string | null;
  input_snapshot: Record<string, unknown>;
  policy_evaluation: Record<string, unknown>;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  approval_channel: string;
  reason_codes: string[];
  rationale_text: string | null;
  commit_writes: Array<Record<string, unknown>>;
  source_type: string | null;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DecisionEntity {
  id: string;
  decision_id: string;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  entity_snapshot: Record<string, unknown> | null;
  created_at: string;
}

const unavailable = () => new Error(
  "Decision Ledger writes are unavailable pending workflow-specific transactional audit capture.",
);

export const useCreateDecisionTrace = () => useMutation({
  mutationFn: async (_input: DecisionTraceInput & { approval_status: string }): Promise<never> => {
    throw unavailable();
  },
});

export const useDecisionTraces = (filters?: {
  decision_type?: DecisionType;
  source_type?: string;
  source_id?: string;
  approval_status?: string;
  limit?: number;
}) => {
  const { profile, user } = useAuth();

  return useQuery({
    queryKey: ["decision-history", user?.id, profile?.org_id, filters],
    queryFn: async () => {
      if (!user?.id || !profile?.org_id) return [];

      let query = supabase
        .from("decision_traces")
        .select("*")
        .eq("org_id", profile.org_id)
        .order("created_at", { ascending: false });

      if (filters?.decision_type) query = query.eq("decision_type", filters.decision_type);
      if (filters?.source_type) query = query.eq("source_type", filters.source_type);
      if (filters?.source_id) query = query.eq("source_id", filters.source_id);
      if (filters?.approval_status) query = query.eq("approval_status", filters.approval_status);
      if (filters?.limit) query = query.limit(filters.limit);

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as DecisionTrace[];
    },
    enabled: Boolean(user?.id && profile?.org_id),
  });
};

export const useDecisionEntities = (decisionId: string | null) => {
  const { profile, user } = useAuth();

  return useQuery({
    queryKey: ["decision-entity-history", user?.id, profile?.org_id, decisionId],
    queryFn: async () => {
      if (!decisionId || !profile?.org_id || !user?.id) return [];
      const { data, error } = await supabase
        .from("decision_entities")
        .select("*")
        .eq("decision_id", decisionId);
      if (error) throw error;
      return (data ?? []) as unknown as DecisionEntity[];
    },
    enabled: Boolean(decisionId && user?.id && profile?.org_id),
  });
};

export const useFindPrecedents = (_input: {
  decision_type: DecisionType;
  source_type: string;
  limit?: number;
}) => useQuery({
  queryKey: ["decision-comparison-unavailable"],
  queryFn: async (): Promise<DecisionTrace[]> => [],
  staleTime: Infinity,
});

export const captureDecisionTrace = async (
  orgId: string,
  input: DecisionTraceInput & { approval_status: string },
): Promise<DecisionTrace | null> => {
  void orgId;
  void input;
  return null;
};
