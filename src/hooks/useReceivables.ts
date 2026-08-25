import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export interface ReceivablesCustomer {
  id: string;
  name: string;
  email: string | null;
  creditLimit: number | null;
}

export interface PostedInvoiceHistory {
  id: string;
  invoiceNumber: string;
  customerName: string;
  issueDate: string;
  dueDate: string;
  total: number;
  currency: string | null;
  journalEntryId: string;
}

export interface PostedCreditNoteHistory {
  id: string;
  originalInvoiceId: string;
  creditNoteNumber: string;
  issueDate: string;
  total: number;
  currency: string;
  journalEntryId: string;
}

export const useReceivables = () => {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  const ready = Boolean(user?.id && orgId);

  const customersQuery = useQuery({
    queryKey: ["receivables-customers", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const { data, error } = await supabase
        .from("customers")
        .select("id, name, email, credit_limit")
        .eq("org_id", orgId)
        .order("name");
      if (error) throw error;
      return (data ?? []).map((customer): ReceivablesCustomer => ({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        creditLimit: customer.credit_limit,
      }));
    },
    enabled: ready,
  });

  const postedInvoicesQuery = useQuery({
    queryKey: ["posted-invoice-history", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, issue_date, due_date, total, currency, journal_entry_id, customers(name)")
        .eq("org_id", orgId)
        .eq("accounting_status", "POSTED")
        .not("journal_entry_id", "is", null)
        .order("issue_date", { ascending: false });
      if (error) throw error;

      return (data ?? []).map((invoice): PostedInvoiceHistory => ({
        id: invoice.id,
        invoiceNumber: invoice.invoice_number,
        customerName: invoice.customers?.name ?? "Unknown customer",
        issueDate: invoice.issue_date,
        dueDate: invoice.due_date,
        total: invoice.total,
        currency: invoice.currency,
        journalEntryId: invoice.journal_entry_id as string,
      }));
    },
    enabled: ready,
  });

  const postedCreditNotesQuery = useQuery({
    queryKey: ["posted-credit-note-history", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const { data, error } = await supabase
        .from("customer_credit_notes")
        .select("id, original_invoice_id, credit_note_number, issue_date, total, currency, journal_entry_id")
        .eq("org_id", orgId)
        .not("journal_entry_id", "is", null)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((credit): PostedCreditNoteHistory => ({
        id: credit.id,
        originalInvoiceId: credit.original_invoice_id,
        creditNoteNumber: credit.credit_note_number,
        issueDate: credit.issue_date,
        total: credit.total,
        currency: credit.currency,
        journalEntryId: credit.journal_entry_id,
      }));
    },
    enabled: ready,
  });

  const invoices = postedInvoicesQuery.data ?? [];
  const creditNotes = postedCreditNotesQuery.data ?? [];

  return {
    customers: customersQuery.data ?? [],
    invoices,
    creditNotes,
    stats: {
      customerCount: customersQuery.data?.length ?? 0,
      invoiceCount: invoices.length,
      postedInvoiceTotal: invoices.reduce((sum, invoice) => sum + invoice.total, 0),
      fullCreditCount: creditNotes.length,
    },
    isLoading: customersQuery.isLoading || postedInvoicesQuery.isLoading || postedCreditNotesQuery.isLoading,
    error: customersQuery.error || postedInvoicesQuery.error || postedCreditNotesQuery.error,
  };
};
