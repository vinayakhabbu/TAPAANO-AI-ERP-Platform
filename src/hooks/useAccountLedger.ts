import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { parseAccountLedger, type AccountLedgerRequest } from "@/lib/financeReports";

export async function fetchAccountLedger(request: AccountLedgerRequest, signal?: AbortSignal) {
  const call = supabase.rpc("get_account_ledger", {
    p_entity_id: request.entityId, p_account_id: request.accountId,
    p_from_date: request.fromDate, p_to_date: request.toDate,
    p_offset: request.offset, p_page_size: request.pageSize, p_expected_revision: request.revision,
  });
  const { data, error } = await (signal ? call.abortSignal(signal) : call);
  if (error) throw error;
  return parseAccountLedger(data, request);
}

export function useAccountLedger(request: AccountLedgerRequest) {
  const { user, profile } = useAuth();
  return useQuery({
    queryKey: ["account-ledger", user?.id, profile?.org_id, request],
    enabled: Boolean(user?.id && profile?.org_id), retry: false,
    queryFn: ({ signal }) => fetchAccountLedger(request, signal),
  });
}
