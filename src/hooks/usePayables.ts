import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Vendor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  payment_terms: number | null;
}

export interface Bill {
  id: string;
  bill_number: string;
  vendor_id: string;
  vendor?: Vendor;
  issue_date: string;
  due_date: string;
  subtotal: number;
  tax: number;
  total: number;
  amount_paid: number;
  status: "draft" | "pending" | "paid" | "overdue" | "cancelled";
  purchase_order_id: string | null;
  goods_receipt_id: string | null;
  match_status: string | null;
}

export interface PurchaseOrder {
  id: string;
  po_number: string;
  vendor_id: string;
  vendor?: Vendor;
  order_date: string;
  expected_delivery_date: string | null;
  status: "draft" | "pending_approval" | "approved" | "partially_received" | "received" | "cancelled";
  subtotal: number;
  tax: number;
  total: number;
  notes: string | null;
}

export interface GoodsReceipt {
  id: string;
  receipt_number: string;
  purchase_order_id: string;
  receipt_date: string;
  notes: string | null;
}

export interface PaymentRun {
  id: string;
  run_number: string;
  run_date: string;
  status: "draft" | "pending_approval" | "approved" | "processing" | "completed" | "failed";
  total_amount: number;
  payment_method: string | null;
}

export const useVendors = () => {
  return useQuery({
    queryKey: ["vendors"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vendors")
        .select("*")
        .order("name");
      
      if (error) throw error;
      return data as Vendor[];
    },
  });
};

export const useBills = () => {
  return useQuery({
    queryKey: ["bills"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bills")
        .select(`
          *,
          vendor:vendors(*)
        `)
        .order("due_date", { ascending: true });
      
      if (error) throw error;
      return data as (Bill & { vendor: Vendor })[];
    },
  });
};

export const usePurchaseOrders = () => {
  return useQuery({
    queryKey: ["purchase_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(`
          *,
          vendor:vendors(*)
        `)
        .order("order_date", { ascending: false });
      
      if (error) throw error;
      return data as (PurchaseOrder & { vendor: Vendor })[];
    },
  });
};

export const useGoodsReceipts = () => {
  return useQuery({
    queryKey: ["goods_receipts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("goods_receipts")
        .select("*")
        .order("receipt_date", { ascending: false });
      
      if (error) throw error;
      return data as GoodsReceipt[];
    },
  });
};

export const usePaymentRuns = () => {
  return useQuery({
    queryKey: ["payment_runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_runs")
        .select("*")
        .order("run_date", { ascending: false });
      
      if (error) throw error;
      return data as PaymentRun[];
    },
  });
};

export const usePayablesSummary = () => {
  const { data: bills = [], isLoading: billsLoading } = useBills();
  const { data: vendors = [], isLoading: vendorsLoading } = useVendors();
  const { data: purchaseOrders = [], isLoading: posLoading } = usePurchaseOrders();
  const { data: paymentRuns = [], isLoading: runsLoading } = usePaymentRuns();

  const today = new Date();
  const weekFromNow = new Date(today);
  weekFromNow.setDate(today.getDate() + 7);

  const totalAP = bills
    .filter(b => b.status !== "paid" && b.status !== "cancelled")
    .reduce((sum, b) => sum + (b.total - b.amount_paid), 0);

  const dueThisWeek = bills
    .filter(b => {
      const dueDate = new Date(b.due_date);
      return b.status !== "paid" && b.status !== "cancelled" && 
             dueDate >= today && dueDate <= weekFromNow;
    })
    .reduce((sum, b) => sum + (b.total - b.amount_paid), 0);

  const overdue = bills
    .filter(b => {
      const dueDate = new Date(b.due_date);
      return b.status !== "paid" && b.status !== "cancelled" && dueDate < today;
    })
    .reduce((sum, b) => sum + (b.total - b.amount_paid), 0);

  const openPOs = purchaseOrders.filter(
    po => po.status !== "received" && po.status !== "cancelled"
  ).length;

  const pendingPaymentRuns = paymentRuns.filter(
    pr => pr.status === "pending_approval" || pr.status === "approved"
  ).length;

  return {
    totalAP,
    dueThisWeek,
    overdue,
    vendorCount: vendors.length,
    openPOs,
    pendingPaymentRuns,
    isLoading: billsLoading || vendorsLoading || posLoading || runsLoading,
  };
};
