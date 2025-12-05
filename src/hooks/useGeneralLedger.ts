import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useAccounts = () => {
  return useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("*")
        .eq("is_active", true)
        .order("code");

      if (error) throw error;
      return data;
    },
  });
};

export const useJournalEntries = () => {
  return useQuery({
    queryKey: ["journal-entries"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("journal_entries")
        .select(`
          *,
          journal_lines(
            id,
            debit,
            credit,
            memo,
            account:accounts(name, code)
          )
        `)
        .order("entry_date", { ascending: false })
        .limit(20);

      if (error) throw error;
      return data;
    },
  });
};

export const useAccountBalances = () => {
  return useQuery({
    queryKey: ["account-balances"],
    queryFn: async () => {
      // Get all journal lines with their account types
      const { data: journalLines, error } = await supabase
        .from("journal_lines")
        .select(`
          debit,
          credit,
          account:accounts(id, name, code, account_type, parent_id)
        `);

      if (error) throw error;

      // Calculate balances per account
      const balances: Record<string, number> = {};
      
      journalLines?.forEach((line) => {
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
  });
};
