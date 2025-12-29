import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Json } from "@/integrations/supabase/types";

// Decision types for the ERP
export type DecisionType = 
  | "po_approval" 
  | "po_rejection"
  | "payment_approval" 
  | "payment_rejection"
  | "payment_processing"
  | "journal_post"
  | "journal_reverse"
  | "bill_status_change"
  | "requisition_approval"
  | "requisition_rejection"
  | "requisition_submit"
  | "invoice_sent"
  | "invoice_void"
  | "credit_override"
  | "discount_override";

export interface DecisionTraceInput {
  decision_type: DecisionType;
  source_type: string;
  source_id: string;
  input_snapshot: Record<string, unknown>;
  policy_evaluation?: Record<string, unknown>;
  reason_codes?: string[];
  rationale_text?: string;
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

// Helper function for raw SQL queries to bypass type checking for new tables
const insertDecisionTrace = async (data: Record<string, unknown>) => {
  const { data: result, error } = await supabase.rpc('insert_decision_trace' as any, data);
  return { data: result, error };
};

// Create a decision trace
export const useCreateDecisionTrace = () => {
  const queryClient = useQueryClient();
  const { profile } = useAuth();

  return useMutation({
    mutationFn: async (input: DecisionTraceInput & { approval_status: string }) => {
      if (!profile?.org_id) throw new Error("No organization context");

      const { data: { user } } = await supabase.auth.getUser();

      // Use raw fetch to insert into decision_traces (bypasses type checking)
      const insertData = {
        org_id: profile.org_id,
        decision_type: input.decision_type,
        source_type: input.source_type,
        source_id: input.source_id,
        input_snapshot: input.input_snapshot,
        policy_evaluation: input.policy_evaluation || {},
        approval_status: input.approval_status,
        approved_by: input.approval_status !== "pending" ? user?.id : null,
        approved_at: input.approval_status !== "pending" ? new Date().toISOString() : null,
        reason_codes: input.reason_codes || [],
        rationale_text: input.rationale_text || null,
        commit_writes: input.commit_writes || [],
      };

      const { data: traces, error: traceError } = await supabase
        .from("decision_traces")
        .insert(insertData as any)
        .select("*");

      if (traceError) throw traceError;
      const trace = traces?.[0] as unknown as DecisionTrace;
      if (!trace) throw new Error("Failed to create decision trace");

      // Create linked entities if provided
      if (input.entities && input.entities.length > 0) {
        const entitiesData = input.entities.map((entity) => ({
          decision_id: trace.id,
          entity_type: entity.entity_type,
          entity_id: entity.entity_id,
          entity_label: entity.entity_label || null,
          entity_snapshot: entity.entity_snapshot || null,
        }));

        const { error: entitiesError } = await supabase
          .from("decision_entities")
          .insert(entitiesData as any);

        if (entitiesError) {
          console.error("Failed to create decision entities:", entitiesError);
        }
      }

      return trace;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decision-traces"] });
    },
  });
};

// Fetch decision traces with filters
export const useDecisionTraces = (filters?: {
  decision_type?: DecisionType;
  source_type?: string;
  source_id?: string;
  approval_status?: string;
  limit?: number;
}) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["decision-traces", filters],
    queryFn: async () => {
      if (!profile?.org_id) return [];

      let query = supabase
        .from("decision_traces")
        .select("*")
        .eq("org_id", profile.org_id)
        .order("created_at", { ascending: false });

      if (filters?.decision_type) {
        query = query.eq("decision_type", filters.decision_type);
      }
      if (filters?.source_type) {
        query = query.eq("source_type", filters.source_type);
      }
      if (filters?.source_id) {
        query = query.eq("source_id", filters.source_id);
      }
      if (filters?.approval_status) {
        query = query.eq("approval_status", filters.approval_status);
      }
      if (filters?.limit) {
        query = query.limit(filters.limit);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as DecisionTrace[];
    },
    enabled: !!profile?.org_id,
  });
};

// Fetch decision entities for a specific decision
export const useDecisionEntities = (decisionId: string | null) => {
  return useQuery({
    queryKey: ["decision-entities", decisionId],
    queryFn: async () => {
      if (!decisionId) return [];

      const { data, error } = await supabase
        .from("decision_entities")
        .select("*")
        .eq("decision_id", decisionId);

      if (error) throw error;
      return (data || []) as unknown as DecisionEntity[];
    },
    enabled: !!decisionId,
  });
};

// Find similar precedents (basic implementation - can be enhanced with vector search later)
export const useFindPrecedents = (input: {
  decision_type: DecisionType;
  source_type: string;
  limit?: number;
}) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["precedents", input],
    queryFn: async () => {
      if (!profile?.org_id) return [];

      const { data, error } = await supabase
        .from("decision_traces")
        .select("*")
        .eq("org_id", profile.org_id)
        .eq("decision_type", input.decision_type)
        .eq("source_type", input.source_type)
        .in("approval_status", ["approved", "rejected"])
        .order("created_at", { ascending: false })
        .limit(input.limit || 5);

      if (error) throw error;
      return (data || []) as unknown as DecisionTrace[];
    },
    enabled: !!profile?.org_id,
  });
};

// Helper to capture a decision from existing approval flows
export const captureDecisionTrace = async (
  orgId: string,
  input: DecisionTraceInput & { approval_status: string }
): Promise<DecisionTrace | null> => {
  const { data: { user } } = await supabase.auth.getUser();

  const insertData = {
    org_id: orgId,
    decision_type: input.decision_type,
    source_type: input.source_type,
    source_id: input.source_id,
    input_snapshot: input.input_snapshot,
    policy_evaluation: input.policy_evaluation || {},
    approval_status: input.approval_status,
    approved_by: input.approval_status !== "pending" ? user?.id : null,
    approved_at: input.approval_status !== "pending" ? new Date().toISOString() : null,
    reason_codes: input.reason_codes || [],
    rationale_text: input.rationale_text || null,
    commit_writes: input.commit_writes || [],
  };

  const { data: traces, error: traceError } = await supabase
    .from("decision_traces")
    .insert(insertData as any)
    .select("*");

  if (traceError) {
    console.error("Failed to capture decision trace:", traceError);
    return null;
  }

  const trace = traces?.[0] as unknown as DecisionTrace;
  if (!trace) return null;

  // Create linked entities
  if (input.entities && input.entities.length > 0) {
    const entitiesData = input.entities.map((entity) => ({
      decision_id: trace.id,
      entity_type: entity.entity_type,
      entity_id: entity.entity_id,
      entity_label: entity.entity_label || null,
      entity_snapshot: entity.entity_snapshot || null,
    }));

    await supabase
      .from("decision_entities")
      .insert(entitiesData as any);
  }

  return trace;
};
