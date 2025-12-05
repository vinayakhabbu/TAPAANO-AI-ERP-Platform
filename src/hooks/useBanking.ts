import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const useBankAccounts = () => {
  return useQuery({
    queryKey: ["bank-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_accounts")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      return data;
    },
  });
};

export const useBankTransactions = () => {
  return useQuery({
    queryKey: ["bank-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_transactions")
        .select(`
          *,
          bank_account:bank_accounts(name),
          matched_invoice:invoices(invoice_number),
          matched_bill:bills(bill_number),
          suggested_account:accounts(name, code)
        `)
        .order("transaction_date", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
  });
};
