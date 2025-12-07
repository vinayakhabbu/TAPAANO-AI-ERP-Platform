import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createCODocumentFromJournalEntry } from "./useCOIntegration";

// Post bank transaction through GL (Banking -> GL -> CO flow)
export const usePostBankTransactionViaGL = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      bankTransactionId,
      bankAccountId,
      transactionType,
      amount,
      description,
      transactionDate,
      offsetAccountId,
      costCenterId,
    }: {
      bankTransactionId: string;
      bankAccountId: string;
      transactionType: "customer_receipt" | "vendor_payment" | "bank_charge" | "interest" | "transfer" | "other";
      amount: number;
      description?: string;
      transactionDate: string;
      offsetAccountId: string;
      costCenterId?: string;
    }) => {
      // Get org_id and entity_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      // Get bank account's GL account
      const { data: bankAccount, error: bankError } = await supabase
        .from("bank_accounts")
        .select("account_id, entity_id")
        .eq("id", bankAccountId)
        .single();

      if (bankError || !bankAccount?.account_id) {
        throw new Error("Bank account not linked to a GL account");
      }

      // Determine debit/credit based on transaction type
      let bankDebit = 0;
      let bankCredit = 0;
      let offsetDebit = 0;
      let offsetCredit = 0;

      switch (transactionType) {
        case "customer_receipt":
          // Money coming in: Dr Bank, Cr AR/Revenue
          bankDebit = amount;
          offsetCredit = amount;
          break;
        case "vendor_payment":
          // Money going out: Dr AP/Expense, Cr Bank
          offsetDebit = amount;
          bankCredit = amount;
          break;
        case "bank_charge":
          // Expense: Dr Bank Charges Expense, Cr Bank
          offsetDebit = amount;
          bankCredit = amount;
          break;
        case "interest":
          // Could be income or expense
          if (amount > 0) {
            // Interest income: Dr Bank, Cr Interest Income
            bankDebit = amount;
            offsetCredit = amount;
          } else {
            // Interest expense: Dr Interest Expense, Cr Bank
            offsetDebit = Math.abs(amount);
            bankCredit = Math.abs(amount);
          }
          break;
        case "transfer":
          // Transfer between accounts: Dr receiving bank, Cr sending bank
          bankDebit = amount > 0 ? amount : 0;
          bankCredit = amount < 0 ? Math.abs(amount) : 0;
          offsetDebit = amount < 0 ? Math.abs(amount) : 0;
          offsetCredit = amount > 0 ? amount : 0;
          break;
        default:
          if (amount > 0) {
            bankDebit = amount;
            offsetCredit = amount;
          } else {
            offsetDebit = Math.abs(amount);
            bankCredit = Math.abs(amount);
          }
      }

      // Generate entry number
      const entryNumber = `BANK-${Date.now().toString(36).toUpperCase()}`;

      // Create journal entry via GL
      const { data: journalEntry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          org_id: profile.org_id,
          entity_id: bankAccount.entity_id,
          entry_number: entryNumber,
          entry_date: transactionDate,
          memo: description || `Bank ${transactionType}`,
          source_module: "banking",
          status: "posted",
          posted_at: new Date().toISOString(),
        } as any)
        .select()
        .single();

      if (entryError) throw entryError;

      // Create journal lines
      const journalLines = [
        {
          journal_entry_id: journalEntry.id,
          account_id: bankAccount.account_id,
          debit: bankDebit,
          credit: bankCredit,
          memo: description,
          cost_center_id: null, // Bank accounts typically don't have CO assignment
        },
        {
          journal_entry_id: journalEntry.id,
          account_id: offsetAccountId,
          debit: offsetDebit,
          credit: offsetCredit,
          memo: description,
          cost_center_id: costCenterId || null, // CO assignment for expense/revenue accounts
        },
      ];

      const { error: linesError } = await supabase
        .from("journal_lines")
        .insert(journalLines as any);

      if (linesError) throw linesError;

      // Update bank transaction with journal entry reference
      const { error: updateError } = await supabase
        .from("bank_transactions")
        .update({
          journal_entry_id: journalEntry.id,
          status: "posted",
        } as any)
        .eq("id", bankTransactionId);

      if (updateError) throw updateError;

      // Create CO document if applicable (for expense/revenue accounts with CO category)
      await createCODocumentFromJournalEntry(
        journalEntry.id,
        profile.org_id,
        transactionDate,
        "banking"
      );

      return journalEntry;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bank-transactions"] });
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["co-documents"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
    },
  });
};

// Hook to post bank charge with automatic CO impact
export const usePostBankCharge = () => {
  const postViaGL = usePostBankTransactionViaGL();

  return useMutation({
    mutationFn: async ({
      bankAccountId,
      amount,
      description,
      transactionDate,
      expenseAccountId,
      costCenterId,
    }: {
      bankAccountId: string;
      amount: number;
      description: string;
      transactionDate: string;
      expenseAccountId: string;
      costCenterId?: string;
    }) => {
      // Get org_id
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      // Create bank transaction record
      const { data: bankTxn, error: txnError } = await supabase
        .from("bank_transactions")
        .insert({
          org_id: profile.org_id,
          bank_account_id: bankAccountId,
          transaction_date: transactionDate,
          amount: -Math.abs(amount), // Negative for outflow
          description,
          status: "pending",
        } as any)
        .select()
        .single();

      if (txnError) throw txnError;

      // Post via GL with CO integration
      return postViaGL.mutateAsync({
        bankTransactionId: bankTxn.id,
        bankAccountId,
        transactionType: "bank_charge",
        amount: Math.abs(amount),
        description,
        transactionDate,
        offsetAccountId: expenseAccountId,
        costCenterId,
      });
    },
  });
};
