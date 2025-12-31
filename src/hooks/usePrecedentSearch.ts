import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface Precedent {
  decision_id: string;
  decision_type: string;
  similarity: number;
  input_snapshot: Record<string, unknown>;
  rationale_text: string | null;
  reason_codes?: string[];
  approval_status: string;
  created_at: string;
  entities?: Array<{
    entity_type: string;
    entity_id: string;
    entity_label: string | null;
  }>;
  context_summary?: string;
}

export interface PrecedentSearchResult {
  success: boolean;
  precedents: Precedent[];
  total: number;
  search_method: "vector" | "text";
}

export const usePrecedentSearch = (params: {
  query: string;
  decision_type?: string;
  limit?: number;
  enabled?: boolean;
}) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["precedent-search", params.query, params.decision_type, params.limit],
    queryFn: async (): Promise<PrecedentSearchResult> => {
      if (!profile?.org_id || !params.query.trim()) {
        return { success: true, precedents: [], total: 0, search_method: "text" };
      }

      // Try edge function first
      try {
        const { data, error } = await supabase.functions.invoke("precedent-search", {
          body: {
            org_id: profile.org_id,
            query: params.query,
            decision_type: params.decision_type,
            limit: params.limit || 10,
          },
        });

        if (!error && data?.success) {
          return data as PrecedentSearchResult;
        }
      } catch {
        console.log("Edge function unavailable, using fallback search");
      }

      // Fallback to direct database text search
      const { data, error } = await supabase.rpc("search_precedents_by_text", {
        p_org_id: profile.org_id,
        p_search_text: params.query,
        p_decision_type: params.decision_type || null,
        p_limit: params.limit || 10,
      });

      if (error) {
        console.error("Precedent search error:", error);
        return { success: false, precedents: [], total: 0, search_method: "text" };
      }

      const precedents: Precedent[] = (data || []).map((p: any) => ({
        decision_id: p.decision_id,
        decision_type: p.decision_type,
        similarity: Math.min(0.99, 0.5 + (p.relevance || 0) * 0.1),
        input_snapshot: p.input_snapshot,
        rationale_text: p.rationale_text,
        reason_codes: p.reason_codes,
        approval_status: p.approval_status,
        created_at: p.created_at,
      }));

      return {
        success: true,
        precedents,
        total: precedents.length,
        search_method: "text",
      };
    },
    enabled: params.enabled !== false && !!profile?.org_id && !!params.query.trim(),
    staleTime: 30000,
  });
};

export const useRecentPrecedents = (params: {
  decision_type?: string;
  limit?: number;
}) => {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ["recent-precedents", params.decision_type, params.limit],
    queryFn: async (): Promise<Precedent[]> => {
      if (!profile?.org_id) return [];

      let query = supabase
        .from("decision_traces")
        .select("id, decision_type, input_snapshot, rationale_text, reason_codes, approval_status, created_at")
        .eq("org_id", profile.org_id)
        .in("approval_status", ["approved", "rejected"])
        .order("created_at", { ascending: false })
        .limit(params.limit || 20);

      if (params.decision_type) {
        query = query.eq("decision_type", params.decision_type);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Recent precedents error:", error);
        return [];
      }

      return (data || []).map((d: any) => ({
        decision_id: d.id,
        decision_type: d.decision_type,
        similarity: 1,
        input_snapshot: d.input_snapshot || {},
        rationale_text: d.rationale_text,
        reason_codes: d.reason_codes,
        approval_status: d.approval_status,
        created_at: d.created_at,
      }));
    },
    enabled: !!profile?.org_id,
  });
};