import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { JOURNAL_HISTORY_SELECT } from "@/lib/journalQuery";
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
      const { data, error } = await supabase
        .from("journal_entries")
        .select(JOURNAL_HISTORY_SELECT)
        .eq("org_id", profile.org_id)
        .order("entry_date", { ascending: false })
        .order("id")
        .limit(20);

      if (error) throw error;
      return data;
    },
    enabled: Boolean(user?.id && profile?.org_id),
  });
};

export const useAccountBalances = () => {
  const { user, profile } = useAuth();
  return useQuery({
    queryKey: ["ledger-balances", user?.id, profile?.org_id],
    queryFn: async () => {
      if (!user?.id || !profile?.org_id) return {};
      const { data: entries, error } = await supabase
        .from("journal_entries")
        .select(`
          journal_lines(
            debit,
            credit,
            account:accounts(id, name, code, account_type, parent_id)
          )
        `)
        .eq("org_id", profile.org_id)
        .eq("status", "posted");

      if (error) throw error;

      // Calculate balances per account
      const balances: Record<string, number> = {};
      
      entries?.flatMap((entry) => entry.journal_lines ?? []).forEach((line) => {
        if (line.account) {
          const accountId = line.account.id;
          const accountType = line.account.account_type;
          
          if (!balances[accountId]) {
            balances[accountId] = 0;
          }
          
          // Assets and Expenses increase with debits
          // Liabilities, Equity, and Revenue increase with credits
          if (accountType === 'asset' || accountType === 'expense') {
            balances[accountId] += (line.debit || 0) - (line.credit || 0);
          } else {
            balances[accountId] += (line.credit || 0) - (line.debit || 0);
          }
        }
      });

      return balances;
    },
    enabled: Boolean(user?.id && profile?.org_id),
  });
};
