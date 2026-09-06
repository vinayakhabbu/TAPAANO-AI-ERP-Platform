import { readAllRows } from "@/lib/readAllRows";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const useAccountingPeriods = () => {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ["accounting-periods", user?.id, profile?.org_id],
    queryFn: async () => {
      if (!user?.id || !profile?.org_id) return [];
      const data = await readAllRows((from, to) => supabase
        .from("accounting_periods")
        .select("*", { count: "exact" })
        .eq("org_id", profile.org_id)
        .order("period_start", { ascending: false })
        .order("id")
        .range(from, to));
      return data ?? [];
    },
    enabled: Boolean(user?.id && profile?.org_id),
  });
};
