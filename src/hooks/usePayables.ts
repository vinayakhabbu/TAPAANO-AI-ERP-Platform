import { useOperationalSummary } from "@/hooks/useOperationalSummary";
import { readAllRows } from "@/lib/readAllRows";
import { LEGACY_BILL_SELECT, POSTED_BILL_SELECT } from "@/lib/documentQueries";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

export interface Vendor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_terms: number | null;
}

export interface PostedSupplierBill {
  id: string;
  billNumber: string;
  vendorName: string;
  issueDate: string;
  dueDate: string;
  total: number;
  currency: string;
  journalEntryId: string;
}

export interface PostedSupplierCredit {
  id: string;
  originalBillId: string;
  creditNoteNumber: string;
  issueDate: string;
  total: number;
  currency: string;
  journalEntryId: string;
}

export interface PostedSupplierPayment {
  id: string;
  billId: string;
  paymentNumber: string;
  paymentDate: string;
  amount: number;
  currency: string;
  reference: string;
  journalEntryId: string;
}

export interface PostedSupplierPaymentCorrection {
  id: string;
  originalPaymentId: string;
  correctionNumber: string;
  correctionDate: string;
  amount: number;
  currency: string;
  reason: string;
  journalEntryId: string;
}

export interface PostedSupplierPaymentReplacement {
  id: string;
  originalPaymentId: string;
  originalCorrectionId: string;
  billId: string;
  replacementNumber: string;
  replacementDate: string;
  amount: number;
  currency: string;
  reference: string;
  journalEntryId: string;
}

export const useVendors = () => {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  return useQuery({
    queryKey: ["vendors", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const data = await readAllRows((from, to) => supabase
        .from("vendors")
        .select("id, name, email, phone, address, payment_terms", { count: "exact" })
        .eq("org_id", orgId)
        .order("name")
        .order("id")
        .range(from, to));
      return data as Vendor[];
    },
    enabled: Boolean(user?.id && orgId),
  });
};

export const useBills = () => {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  return useQuery({
    queryKey: ["legacy-bill-history", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const data = await readAllRows((from, to) => supabase
        .from("bills")
        .select(LEGACY_BILL_SELECT, { count: "exact" })
        .eq("org_id", orgId)
        .eq("accounting_status", "UNVERIFIED_LEGACY")
        .order("issue_date", { ascending: false })
        .order("id")
        .range(from, to));
      return data ?? [];
    },
    enabled: Boolean(user?.id && orgId),
  });
};

export const usePostedSupplierBills = () => {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  return useQuery({
    queryKey: ["posted-supplier-bill-history", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const data = await readAllRows((from, to) => supabase
        .from("bills")
        .select(POSTED_BILL_SELECT, { count: "exact" })
        .eq("org_id", orgId)
        .eq("accounting_status", "POSTED")
        .not("journal_entry_id", "is", null)
        .order("issue_date", { ascending: false })
        .order("id")
        .range(from, to));
      return (data ?? []).map((bill): PostedSupplierBill => ({
        id: bill.id,
        billNumber: bill.bill_number,
        vendorName: bill.vendors?.name ?? "Unknown vendor",
        issueDate: bill.issue_date,
        dueDate: bill.due_date,
        total: bill.total,
        currency: bill.currency ?? "",
        journalEntryId: bill.journal_entry_id as string,
      }));
    },
    enabled: Boolean(user?.id && orgId),
  });
};

export const usePostedSupplierCredits = () => {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  return useQuery({
    queryKey: ["posted-supplier-credit-history", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const data = await readAllRows((from, to) => supabase
        .from("supplier_bill_credit_notes")
        .select("id, original_bill_id, credit_note_number, issue_date, total, currency, journal_entry_id", { count: "exact" })
        .eq("org_id", orgId)
        .order("issue_date", { ascending: false })
        .order("id")
        .range(from, to));
      return (data ?? []).map((credit): PostedSupplierCredit => ({
        id: credit.id,
        originalBillId: credit.original_bill_id,
        creditNoteNumber: credit.credit_note_number,
        issueDate: credit.issue_date,
        total: credit.total,
        currency: credit.currency,
        journalEntryId: credit.journal_entry_id,
      }));
    },
    enabled: Boolean(user?.id && orgId),
  });
};

export const usePostedSupplierPayments = () => {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  return useQuery({
    queryKey: ["posted-supplier-payment-history", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const data = await readAllRows((from, to) => supabase
        .from("supplier_payments")
        .select("id, bill_id, payment_number, payment_date, amount, currency, payment_reference, journal_entry_id", { count: "exact" })
        .eq("org_id", orgId)
        .order("payment_date", { ascending: false })
        .order("id")
        .range(from, to));
      return (data ?? []).map((payment): PostedSupplierPayment => ({
        id: payment.id,
        billId: payment.bill_id,
        paymentNumber: payment.payment_number,
        paymentDate: payment.payment_date,
        amount: payment.amount,
        currency: payment.currency,
        reference: payment.payment_reference,
        journalEntryId: payment.journal_entry_id,
      }));
    },
    enabled: Boolean(user?.id && orgId),
  });
};

export const usePostedSupplierPaymentCorrections = () => {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  return useQuery({
    queryKey: ["posted-supplier-payment-correction-history", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const data = await readAllRows((from, to) => supabase
        .from("supplier_payment_corrections")
        .select("id, original_payment_id, correction_number, correction_date, amount, currency, reason, journal_entry_id", { count: "exact" })
        .eq("org_id", orgId)
        .not("journal_entry_id", "is", null)
        .order("correction_date", { ascending: false })
        .order("id")
        .range(from, to));
      return (data ?? []).map((correction): PostedSupplierPaymentCorrection => ({
        id: correction.id,
        originalPaymentId: correction.original_payment_id,
        correctionNumber: correction.correction_number,
        correctionDate: correction.correction_date,
        amount: correction.amount,
        currency: correction.currency,
        reason: correction.reason,
        journalEntryId: correction.journal_entry_id,
      }));
    },
    enabled: Boolean(user?.id && orgId),
  });
};

export const usePostedSupplierPaymentReplacements = () => {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  return useQuery({
    queryKey: ["posted-supplier-payment-replacement-history", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const data = await readAllRows((from, to) => supabase
        .from("supplier_payment_replacements")
        .select("id, original_payment_id, original_correction_id, bill_id, replacement_number, replacement_date, amount, currency, reference, journal_entry_id", { count: "exact" })
        .eq("org_id", orgId)
        .not("journal_entry_id", "is", null)
        .order("replacement_date", { ascending: false })
        .order("id")
        .range(from, to));
      return (data ?? []).map((replacement): PostedSupplierPaymentReplacement => ({
        id: replacement.id,
        originalPaymentId: replacement.original_payment_id,
        originalCorrectionId: replacement.original_correction_id,
        billId: replacement.bill_id,
        replacementNumber: replacement.replacement_number,
        replacementDate: replacement.replacement_date,
        amount: replacement.amount,
        currency: replacement.currency,
        reference: replacement.reference,
        journalEntryId: replacement.journal_entry_id,
      }));
    },
    enabled: Boolean(user?.id && orgId),
  });
};

export const usePaymentRuns = () => {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  return useQuery({
    queryKey: ["legacy-payment-run-history", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const data = await readAllRows((from, to) => supabase
        .from("payment_runs")
        .select("id, run_number, run_date, status", { count: "exact" })
        .eq("org_id", orgId)
        .order("run_date", { ascending: false })
        .order("id")
        .range(from, to));
      return data ?? [];
    },
    enabled: Boolean(user?.id && orgId),
  });
};

export const usePayablesSummary = () => {
  const summary = useOperationalSummary();
  return {
    vendorCount: summary.data?.vendorCount ?? 0,
    billHeaderCount: summary.data?.billHeaderCount ?? 0,
    postedBillCount: summary.data?.postedBillCount ?? 0,
    postedCreditCount: summary.data?.postedCreditCount ?? 0,
    postedPaymentCount: summary.data?.postedPaymentCount ?? 0,
    paymentCorrectionCount: summary.data?.paymentCorrectionCount ?? 0,
    paymentReplacementCount: summary.data?.paymentReplacementCount ?? 0,
    paymentRunHistoryCount: summary.data?.paymentRunHistoryCount ?? 0,
    isLoading: summary.isLoading,
    error: summary.error,
  };
};
