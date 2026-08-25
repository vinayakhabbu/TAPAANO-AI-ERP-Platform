import { useQuery } from "@tanstack/react-query";

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
  search_method: "unavailable";
}

const unavailableResult: PrecedentSearchResult = {
  success: false,
  precedents: [],
  total: 0,
  search_method: "unavailable",
};

export const usePrecedentSearch = (params: {
  query: string;
  decision_type?: string;
  limit?: number;
  enabled?: boolean;
}) => useQuery({
  queryKey: ["precedent-history-unavailable", params.query, params.decision_type, params.limit],
  queryFn: async () => unavailableResult,
  enabled: params.enabled !== false,
  staleTime: Infinity,
});

export const useRecentPrecedents = (params: {
  decision_type?: string;
  limit?: number;
}) => useQuery({
  queryKey: ["precedent-history-unavailable", params.decision_type, params.limit],
  queryFn: async (): Promise<Precedent[]> => [],
  staleTime: Infinity,
});
