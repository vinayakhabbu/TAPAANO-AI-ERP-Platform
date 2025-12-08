import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Matching Rules
export const useMatchingRules = () => {
  return useQuery({
    queryKey: ["matching-rules"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matching_rules")
        .select(`
          *,
          target_account:accounts(id, name, code),
          target_cost_center:cost_centers(id, name, code)
        `)
        .order("priority", { ascending: true });

      if (error) throw error;
      return data;
    },
  });
};

export const useCreateMatchingRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rule: {
      name: string;
      description?: string;
      priority?: number;
      rule_type: string;
      field_to_match: string;
      match_pattern: string;
      match_amount_min?: number;
      match_amount_max?: number;
      target_account_id?: string;
      target_cost_center_id?: string;
      auto_reconcile?: boolean;
    }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("matching_rules")
        .insert({ ...rule, org_id: profile.org_id } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matching-rules"] });
      toast.success("Matching rule created");
    },
    onError: (error) => {
      toast.error("Failed to create rule: " + error.message);
    },
  });
};

export const useUpdateMatchingRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from("matching_rules")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matching-rules"] });
      toast.success("Rule updated");
    },
  });
};

export const useDeleteMatchingRule = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("matching_rules")
        .delete()
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["matching-rules"] });
      toast.success("Rule deleted");
    },
  });
};

// Apply matching rules to pending transactions
export const useAutoMatchTransactions = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Get pending transactions
      const { data: transactions, error: txError } = await supabase
        .from("bank_transactions")
        .select("id")
        .eq("status", "pending");

      if (txError) throw txError;

      // Get active matching rules
      const { data: rules, error: rulesError } = await supabase
        .from("matching_rules")
        .select("*")
        .eq("is_active", true)
        .order("priority", { ascending: true });

      if (rulesError) throw rulesError;

      let matchedCount = 0;

      // Apply rules to each transaction
      for (const tx of transactions || []) {
        const { data } = await supabase.rpc("apply_matching_rules", {
          p_transaction_id: tx.id,
        });
        if (data) matchedCount++;
      }

      return { matchedCount, totalTransactions: transactions?.length || 0 };
    },
    onSuccess: ({ matchedCount, totalTransactions }) => {
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["matching-rules"] });
      toast.success(`Matched ${matchedCount} of ${totalTransactions} transactions`);
    },
    onError: (error) => {
      toast.error("Auto-match failed: " + error.message);
    },
  });
};

// Bank Statement Imports
export const useBankStatementImports = () => {
  return useQuery({
    queryKey: ["bank-statement-imports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_statement_imports")
        .select(`
          *,
          bank_account:bank_accounts(name, bank_name)
        `)
        .order("import_date", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
  });
};

export const useImportBankStatement = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      bankAccountId,
      fileName,
      fileType,
      transactions,
    }: {
      bankAccountId: string;
      fileName: string;
      fileType: string;
      transactions: Array<{
        date: string;
        description: string;
        amount: number;
      }>;
    }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      // Create import record
      const { data: importRecord, error: importError } = await supabase
        .from("bank_statement_imports")
        .insert({
          org_id: profile.org_id,
          bank_account_id: bankAccountId,
          file_name: fileName,
          file_type: fileType,
          status: "processing",
          total_transactions: transactions.length,
        } as any)
        .select()
        .single();

      if (importError) throw importError;

      let importedCount = 0;
      let duplicateCount = 0;
      const startDate = transactions.length > 0 ? transactions[0].date : null;
      const endDate = transactions.length > 0 ? transactions[transactions.length - 1].date : null;

      // Import each transaction
      for (const tx of transactions) {
        // Check for duplicate (same date, amount, description)
        const { data: existing } = await supabase
          .from("bank_transactions")
          .select("id")
          .eq("bank_account_id", bankAccountId)
          .eq("transaction_date", tx.date)
          .eq("amount", tx.amount)
          .eq("description", tx.description)
          .maybeSingle();

        if (existing) {
          duplicateCount++;
          continue;
        }

        // Insert transaction
        const { error: txError } = await supabase
          .from("bank_transactions")
          .insert({
            org_id: profile.org_id,
            bank_account_id: bankAccountId,
            transaction_date: tx.date,
            amount: tx.amount,
            description: tx.description,
            status: "pending",
            import_id: importRecord.id,
          } as any);

        if (!txError) importedCount++;
      }

      // Update import record
      await supabase
        .from("bank_statement_imports")
        .update({
          status: "completed",
          imported_transactions: importedCount,
          duplicate_transactions: duplicateCount,
          statement_start_date: startDate,
          statement_end_date: endDate,
        } as any)
        .eq("id", importRecord.id);

      return { importedCount, duplicateCount };
    },
    onSuccess: ({ importedCount, duplicateCount }) => {
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["bank-statement-imports"] });
      toast.success(`Imported ${importedCount} transactions (${duplicateCount} duplicates skipped)`);
    },
    onError: (error) => {
      toast.error("Import failed: " + error.message);
    },
  });
};

// Bank Feed Connections
export const useBankFeedConnections = () => {
  return useQuery({
    queryKey: ["bank-feed-connections"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bank_feed_connections")
        .select(`
          *,
          bank_account:bank_accounts(id, name, bank_name)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });
};

export const useCreateBankFeedConnection = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connection: {
      bank_account_id: string;
      provider?: string;
      sync_frequency?: string;
      auto_import?: boolean;
    }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("bank_feed_connections")
        .insert({
          ...connection,
          org_id: profile.org_id,
          connection_status: "pending",
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-feed-connections"] });
      toast.success("Bank feed connection created");
    },
  });
};

export const useSyncBankFeed = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (connectionId: string) => {
      // Simulate sync - in production this would call the actual bank feed provider
      await supabase
        .from("bank_feed_connections")
        .update({
          last_sync_at: new Date().toISOString(),
          last_sync_status: "success",
          connection_status: "connected",
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", connectionId);

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-feed-connections"] });
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      toast.success("Bank feed synced successfully");
    },
  });
};

// Positive Pay Checks
export const usePositivePayChecks = (bankAccountId?: string) => {
  return useQuery({
    queryKey: ["positive-pay-checks", bankAccountId],
    queryFn: async () => {
      let query = supabase
        .from("positive_pay_checks")
        .select(`
          *,
          bank_account:bank_accounts(name, bank_name),
          bill:bills(bill_number, vendor:vendors(name))
        `)
        .order("issue_date", { ascending: false })
        .limit(100);

      if (bankAccountId) {
        query = query.eq("bank_account_id", bankAccountId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
};

export const useCreatePositivePayCheck = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (check: {
      bank_account_id: string;
      check_number: string;
      payee_name: string;
      amount: number;
      issue_date: string;
      bill_id?: string;
    }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("positive_pay_checks")
        .insert({ ...check, org_id: profile.org_id } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positive-pay-checks"] });
      toast.success("Check registered for Positive Pay");
    },
  });
};

export const useUpdatePositivePayCheck = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...updates }: { id: string; [key: string]: any }) => {
      const { data, error } = await supabase
        .from("positive_pay_checks")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positive-pay-checks"] });
      toast.success("Check updated");
    },
  });
};

export const useReportCheckException = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      checkId,
      presentedAmount,
      presentedDate,
      exceptionReason,
    }: {
      checkId: string;
      presentedAmount: number;
      presentedDate: string;
      exceptionReason: string;
    }) => {
      const { data, error } = await supabase
        .from("positive_pay_checks")
        .update({
          status: "exception",
          presented_amount: presentedAmount,
          presented_date: presentedDate,
          exception_reason: exceptionReason,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", checkId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positive-pay-checks"] });
      toast.warning("Check exception reported");
    },
  });
};

export const useResolveCheckException = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      checkId,
      resolution,
    }: {
      checkId: string;
      resolution: "paid" | "void";
    }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .single();

      const { data, error } = await supabase
        .from("positive_pay_checks")
        .update({
          status: resolution,
          resolved_at: new Date().toISOString(),
          resolved_by: profile?.id,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", checkId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positive-pay-checks"] });
      toast.success("Exception resolved");
    },
  });
};

// Void a check
export const useVoidCheck = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (checkId: string) => {
      const { data, error } = await supabase
        .from("positive_pay_checks")
        .update({
          status: "void",
          void_date: new Date().toISOString().split("T")[0],
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", checkId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["positive-pay-checks"] });
      toast.success("Check voided");
    },
  });
};
