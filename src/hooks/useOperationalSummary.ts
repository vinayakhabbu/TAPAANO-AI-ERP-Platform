import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { parseOperationalSummary } from "@/lib/operationalSummary";

export function useOperationalSummary() {
  const { user, orgId } = useAuth();
  return useQuery({
    queryKey: ["operational-summary", user?.id, orgId],
    enabled: Boolean(user?.id && orgId),
    queryFn: async () => {
      if (!user?.id || !orgId) throw new Error("Tenant membership is unavailable.");
      const { data, error } = await supabase.rpc("get_tenant_operational_summary");
      if (error) throw error;
      return parseOperationalSummary(data);
    },
  });
}
