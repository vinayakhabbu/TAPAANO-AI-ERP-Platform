import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { readAllRows } from "@/lib/readAllRows";
import { parseTrialBalance, type TrialBalanceRequest } from "@/lib/trialBalance";

export function useReportEntities() {
  const { user, profile } = useAuth();
  return useQuery({
    queryKey: ["report-entities", user?.id, profile?.org_id],
    enabled: Boolean(user?.id && profile?.org_id),
    queryFn: ({ signal }) => readAllRows((from, to) => supabase.from("entities")
      .select("id,name,currency", { count: "exact" }).eq("org_id", profile!.org_id!)
      .order("name").order("id").range(from, to).abortSignal(signal)),
  });
}

export function useTrialBalance(request: TrialBalanceRequest | null) {
  const { user, profile } = useAuth();
  return useQuery({
    queryKey: ["trial-balance", user?.id, profile?.org_id, request?.entityId, request?.fromDate, request?.toDate],
    enabled: Boolean(user?.id && profile?.org_id && request),
    retry: false,
    queryFn: async ({ signal }) => {
      if (!request || !user?.id || !profile?.org_id) throw new Error("Report selection is unavailable.");
      const { data, error } = await supabase.rpc("get_entity_trial_balance", {
        p_entity_id: request.entityId, p_from_date: request.fromDate, p_to_date: request.toDate,
      }).abortSignal(signal);
      if (error) throw error;
      return parseTrialBalance(data, request);
    },
  });
}
