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
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
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
  const paymentRuns = usePaymentRuns();
  return {
    vendorCount: vendors.data?.length ?? 0,
    billHeaderCount: bills.data?.length ?? 0,
    paymentRunHistoryCount: paymentRuns.data?.length ?? 0,
    isLoading: vendors.isLoading || bills.isLoading || paymentRuns.isLoading,
  };
};
