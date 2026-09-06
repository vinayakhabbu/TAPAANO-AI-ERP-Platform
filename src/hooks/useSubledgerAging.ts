import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { parseAgingReport, type AgingRequest } from "@/lib/subledgerAging";

export async function fetchSubledgerAging(request: AgingRequest, signal: AbortSignal) {
  const { data, error } = await supabase.rpc("get_subledger_aging", {
    p_entity_id: request.entityId, p_kind: request.kind, p_as_of: request.asOf, p_offset: request.offset,
    p_page_size: request.pageSize, ...(request.revision ? { p_expected_revision: request.revision } : {}),
  }).abortSignal(signal);
  if (error) throw error;
  return parseAgingReport(data, request);
}
export function useSubledgerAging(request: AgingRequest, generation: number) {
  const { user, profile } = useAuth();
  return useQuery({ queryKey: ["subledger-aging", user?.id, profile?.org_id, request, generation],
    enabled: Boolean(user?.id && profile?.org_id), retry: false,
    queryFn: ({ signal }) => fetchSubledgerAging(request, signal) });
}
