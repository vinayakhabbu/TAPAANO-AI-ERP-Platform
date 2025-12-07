import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Types for CO Integration
export interface CODocument {
  id: string;
  org_id: string;
  document_number: string;
  journal_entry_id: string;
  posting_date: string;
  currency: string;
  source_module: string;
  created_at: string;
}

export interface CODocumentLine {
  id: string;
  co_document_id: string;
  line_number: number;
  journal_line_id: string;
  account_id: string;
  cost_center_id: string | null;
  internal_order_id: string | null;
  profit_center_id: string | null;
  wbs_element_id: string | null;
  amount: number;
  currency: string;
  created_at: string;
}

export interface InternalOrder {
  id: string;
  org_id: string;
  code: string;
  name: string;
  order_type: string;
  status: string;
  valid_from: string;
  valid_to: string | null;
  created_at: string;
  updated_at: string;
}

export interface JournalLineWithCO {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit: number;
  credit: number;
  memo: string | null;
  cost_center_id: string | null;
  internal_order_id: string | null;
  profit_center_id: string | null;
  wbs_element_id: string | null;
  account?: {
    id: string;
    code: string;
    name: string;
    account_type: string;
    controlling_category: string;
    default_cost_center_id: string | null;
    default_internal_order_id: string | null;
  };
}

// Hook to fetch CO documents
export const useCODocuments = () => {
  return useQuery({
    queryKey: ["co-documents"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("co_documents")
        .select(`
          *,
          journal_entry:journal_entries(entry_number, entry_date, memo),
          co_document_lines(
            id,
            line_number,
            amount,
            currency,
            cost_center:cost_centers(code, name),
            account:accounts(code, name)
          )
        `)
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data;
    },
  });
};

// Hook to fetch CO document by journal entry
export const useCODocumentByJournalEntry = (journalEntryId: string | null) => {
  return useQuery({
    queryKey: ["co-document", journalEntryId],
    queryFn: async () => {
      if (!journalEntryId) return null;
      
      const { data, error } = await supabase
        .from("co_documents")
        .select(`
          *,
          co_document_lines(
            id,
            line_number,
            amount,
            currency,
            cost_center:cost_centers(code, name),
            internal_order:internal_orders(code, name),
            account:accounts(code, name)
          )
        `)
        .eq("journal_entry_id", journalEntryId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!journalEntryId,
  });
};

// Hook to fetch internal orders
export const useInternalOrders = () => {
  return useQuery({
    queryKey: ["internal-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_orders")
        .select("*")
        .eq("status", "open")
        .order("code");

      if (error) throw error;
      return data as InternalOrder[];
    },
  });
};

// Hook to create internal order
export const useCreateInternalOrder = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (order: Omit<InternalOrder, "id" | "org_id" | "created_at" | "updated_at">) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      const { data, error } = await supabase
        .from("internal_orders")
        .insert({
          ...order,
          org_id: profile.org_id,
        } as any)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["internal-orders"] });
    },
  });
};

// Function to create CO document from journal entry
export const createCODocumentFromJournalEntry = async (
  journalEntryId: string,
  orgId: string,
  postingDate: string,
  sourceModule: string = "gl"
) => {
  // Fetch journal lines with account info
  const { data: journalLines, error: linesError } = await supabase
    .from("journal_lines")
    .select(`
      id,
      debit,
      credit,
      memo,
      cost_center_id,
      internal_order_id,
      profit_center_id,
      wbs_element_id,
      account:accounts(
        id,
        code,
        name,
        account_type,
        controlling_category,
        default_cost_center_id,
        default_internal_order_id
      )
    `)
    .eq("journal_entry_id", journalEntryId);

  if (linesError) throw linesError;

  // Filter lines where controlling_category != 'no_co' and amount != 0
  const coRelevantLines = (journalLines || []).filter((line: any) => {
    const account = line.account;
    const amount = (line.debit || 0) - (line.credit || 0);
    return account?.controlling_category !== "no_co" && amount !== 0;
  });

  if (coRelevantLines.length === 0) {
    return null; // No CO document needed
  }

  // Generate document number
  const docNumber = `CO-${Date.now().toString(36).toUpperCase()}`;

  // Create CO document
  const { data: coDoc, error: docError } = await supabase
    .from("co_documents")
    .insert({
      org_id: orgId,
      document_number: docNumber,
      journal_entry_id: journalEntryId,
      posting_date: postingDate,
      source_module: sourceModule,
    } as any)
    .select()
    .single();

  if (docError) throw docError;

  // Create CO document lines
  const coLines = coRelevantLines.map((line: any, index: number) => {
    const amount = (line.debit || 0) - (line.credit || 0);
    return {
      co_document_id: coDoc.id,
      line_number: index + 1,
      journal_line_id: line.id,
      account_id: line.account.id,
      cost_center_id: line.cost_center_id || line.account.default_cost_center_id,
      internal_order_id: line.internal_order_id || line.account.default_internal_order_id,
      profit_center_id: line.profit_center_id,
      wbs_element_id: line.wbs_element_id,
      amount: amount,
      currency: "USD",
    };
  });

  const { error: linesInsertError } = await supabase
    .from("co_document_lines")
    .insert(coLines as any);

  if (linesInsertError) throw linesInsertError;

  return coDoc;
};

// Hook for posting journal entry with CO integration
export const usePostJournalEntryWithCO = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      entityId,
      postingDate,
      memo,
      sourceModule = "gl",
      lines,
    }: {
      entityId: string;
      postingDate: string;
      memo?: string;
      sourceModule?: string;
      lines: {
        accountId: string;
        debit: number;
        credit: number;
        memo?: string;
        costCenterId?: string;
        internalOrderId?: string;
        profitCenterId?: string;
        wbsElementId?: string;
      }[];
    }) => {
      // Get org_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      // Validate debits = credits
      const totalDebits = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
      const totalCredits = lines.reduce((sum, l) => sum + (l.credit || 0), 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error("Journal entry is not balanced: debits must equal credits");
      }

      // Generate entry number
      const entryNumber = `JE-${Date.now().toString(36).toUpperCase()}`;

      // Create journal entry
      const { data: journalEntry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          org_id: profile.org_id,
          entity_id: entityId,
          entry_number: entryNumber,
          entry_date: postingDate,
          memo,
          source_module: sourceModule,
          status: "posted",
          posted_at: new Date().toISOString(),
        } as any)
        .select()
        .single();

      if (entryError) throw entryError;

      // Create journal lines with CO dimensions
      const journalLines = lines.map((line) => ({
        journal_entry_id: journalEntry.id,
        account_id: line.accountId,
        debit: line.debit || 0,
        credit: line.credit || 0,
        memo: line.memo,
        cost_center_id: line.costCenterId,
        internal_order_id: line.internalOrderId,
        profit_center_id: line.profitCenterId,
        wbs_element_id: line.wbsElementId,
      }));

      const { error: linesError } = await supabase
        .from("journal_lines")
        .insert(journalLines as any);

      if (linesError) throw linesError;

      // Create CO document if applicable
      await createCODocumentFromJournalEntry(
        journalEntry.id,
        profile.org_id,
        postingDate,
        sourceModule
      );

      return journalEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["co-documents"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
    },
  });
};

// Hook for cost center balance report
export const useCostCenterBalance = (costCenterId: string | null, fromDate?: string, toDate?: string) => {
  return useQuery({
    queryKey: ["cost-center-balance", costCenterId, fromDate, toDate],
    queryFn: async () => {
      if (!costCenterId) return null;

      let query = supabase
        .from("co_document_lines")
        .select(`
          amount,
          currency,
          co_document:co_documents(posting_date),
          account:accounts(code, name, account_type)
        `)
        .eq("cost_center_id", costCenterId);

      const { data, error } = await query;

      if (error) throw error;

      // Calculate totals
      const totalAmount = (data || []).reduce((sum: number, line: any) => sum + (line.amount || 0), 0);

      return {
        costCenterId,
        totalAmount,
        lineCount: data?.length || 0,
        lines: data,
      };
    },
    enabled: !!costCenterId,
  });
};

// Hook to get accounts with CO configuration
export const useAccountsWithCO = () => {
  return useQuery({
    queryKey: ["accounts-with-co"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select(`
          *,
          default_cost_center:cost_centers(id, code, name),
          default_internal_order:internal_orders(id, code, name)
        `)
        .eq("is_active", true)
        .order("code");

      if (error) throw error;
      return data;
    },
  });
};
