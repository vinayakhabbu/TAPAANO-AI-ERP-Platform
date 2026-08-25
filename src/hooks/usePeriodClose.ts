import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const useAccountingPeriods = () => {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ["accounting-periods", user?.id, profile?.org_id],
    queryFn: async () => {
      if (!user?.id || !profile?.org_id) return [];
      const { data, error } = await supabase
        .from("accounting_periods")
        .select("*")
        .eq("org_id", profile.org_id)
        .order("period_start", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(user?.id && profile?.org_id),
  });
};
