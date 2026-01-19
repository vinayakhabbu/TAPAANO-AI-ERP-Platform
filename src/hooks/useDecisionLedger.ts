import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Json } from "@/integrations/supabase/types";
import type { PolicyEvaluation } from "@/lib/policyRules";

// Decision types for the ERP
export type DecisionType = 
  // Procurement
  | "po_approval" 
  | "po_rejection"
  | "requisition_approval"
  | "requisition_rejection"
  | "requisition_submit"
  // Payables
  | "payment_approval" 
  | "payment_rejection"
  | "payment_processing"
  | "bill_status_change"
  // General Ledger
  | "journal_post"
  | "journal_reverse"
  // Receivables/Invoicing
  | "invoice_sent"
  | "invoice_void"
  | "invoice_paid"
  // Sales/CRM
  | "quotation_sent"
  | "quotation_accepted"
  | "quotation_rejected"
  | "quotation_converted"
  | "sales_order_status_change"
  | "opportunity_stage_change"
  // Inventory
  | "stock_transfer_created"
  | "stock_transfer_completed"
  | "cycle_count_completed"
  | "inventory_receipt_posted"
  | "inventory_adjustment"
  // HR/Payroll
  | "time_off_approval"
  | "time_off_rejection"
  | "expense_claim_approval"
  | "expense_claim_rejection"
  | "expense_claim_paid"
  | "payroll_run_processed"
  // Service Management
  | "service_call_status_change"
  | "service_contract_renewal"
  // Production
  | "production_order_status_change"
  | "production_goods_receipt"
  // Overrides
  | "credit_override"
  | "discount_override";

// Precedent reference structure
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

      // Generate embedding asynchronously for precedent search
      generateEmbeddingForTrace(trace.id);

      return trace;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["decision-traces"] });
      queryClient.invalidateQueries({ queryKey: ["precedent-search"] });
      queryClient.invalidateQueries({ queryKey: ["recent-precedents"] });
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
    approval_channel: input.approval_channel || "human",
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

  // Generate embedding asynchronously for precedent search
  generateEmbeddingForTrace(trace.id);

  return trace;
};

// Helper to generate embedding for a decision trace (fire-and-forget)
const generateEmbeddingForTrace = async (decisionTraceId: string): Promise<void> => {
  try {
    const { error } = await supabase.functions.invoke("generate-embedding", {
      body: { decision_trace_id: decisionTraceId },
    });
    
    if (error) {
      console.warn("Failed to generate embedding (non-blocking):", error);
    }
  } catch (err) {
    // Non-blocking - embedding generation failure shouldn't affect decision logging
    console.warn("Embedding generation failed (non-blocking):", err);
  }
};
