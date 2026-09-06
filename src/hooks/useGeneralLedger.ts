import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { parsePostedJournals } from "@/lib/financeReports";
import { readAllRows } from "@/lib/readAllRows";

export const useAccounts = () => {
  const { user, profile } = useAuth();
  return useQuery({
    queryKey: ["ledger-accounts", user?.id, profile?.org_id],
    queryFn: async () => {
      if (!user?.id || !profile?.org_id) return [];
      const data = await readAllRows((from, to) => supabase
        .from("accounts")
        .select("*", { count: "exact" })
        .eq("org_id", profile.org_id)
        .eq("is_active", true)
        .order("code")
        .order("id")
        .range(from, to));
      return data;
    },
    enabled: Boolean(user?.id && profile?.org_id),
  });
};

export const useJournalEntries = () => {
  const { user, profile } = useAuth();
  return useQuery({
    queryKey: ["journal-history", user?.id, profile?.org_id],
    queryFn: async () => {
      if (!user?.id || !profile?.org_id) return [];
      const { data, error } = await supabase.rpc("get_recent_posted_journals");

      if (error) throw error;
      return parsePostedJournals(data);
    },
    enabled: Boolean(user?.id && profile?.org_id),
  });
};
