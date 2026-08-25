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

export const useVendors = () => {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  return useQuery({
    queryKey: ["vendors", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const { data, error } = await supabase
        .from("vendors")
        .select("id, name, email, phone, address, payment_terms")
        .eq("org_id", orgId)
        .order("name");
      if (error) throw error;
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
      const { data, error } = await supabase
        .from("bills")
        .select("id, bill_number, issue_date, due_date, total, currency, status, vendors(name)")
        .eq("org_id", orgId)
        .eq("accounting_status", "UNVERIFIED_LEGACY")
        .order("issue_date", { ascending: false });
      if (error) throw error;
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
      const { data, error } = await supabase
        .from("bills")
        .select("id, bill_number, issue_date, due_date, total, currency, journal_entry_id, vendors(name)")
        .eq("org_id", orgId)
        .eq("accounting_status", "POSTED")
        .not("journal_entry_id", "is", null)
        .order("issue_date", { ascending: false });
      if (error) throw error;
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

export const usePaymentRuns = () => {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  return useQuery({
    queryKey: ["legacy-payment-run-history", user?.id, orgId],
    queryFn: async () => {
      if (!user?.id || !orgId) return [];
      const { data, error } = await supabase
        .from("payment_runs")
        .select("id, run_number, run_date, status")
        .eq("org_id", orgId)
        .order("run_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: Boolean(user?.id && orgId),
  });
};

export const usePayablesSummary = () => {
  const vendors = useVendors();
  const bills = useBills();
  const postedBills = usePostedSupplierBills();
  const paymentRuns = usePaymentRuns();
  return {
    vendorCount: vendors.data?.length ?? 0,
    billHeaderCount: bills.data?.length ?? 0,
    postedBillCount: postedBills.data?.length ?? 0,
    paymentRunHistoryCount: paymentRuns.data?.length ?? 0,
    isLoading: vendors.isLoading || bills.isLoading || postedBills.isLoading || paymentRuns.isLoading,
  };
};
