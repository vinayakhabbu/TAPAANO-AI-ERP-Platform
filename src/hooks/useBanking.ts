import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export const useBankAccounts = () => {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  return useQuery({
    queryKey: ["bank-account-metadata", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("id, org_id, entity_id, name, bank_name, currency, is_active, created_at, updated_at")
        .eq("org_id", orgId)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(user?.id && orgId),
  });
};

export const useBankTransactions = () => {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  return useQuery({
    queryKey: ["bank-transaction-metadata", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const { data, error } = await supabase
        .from("bank_transactions")
        .select("id, org_id, bank_account_id, transaction_date, description, created_at, updated_at")
        .eq("org_id", orgId)
        .order("transaction_date", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(user?.id && orgId),
  });
};
