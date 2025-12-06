import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

// Consignment Transactions with joins
export const useConsignmentTransactions = () => {
  return useQuery({
    queryKey: ["consignment_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("consignment_transactions")
        .select(`
          *,
          products(id, sku, name),
          vendors(id, name),
          warehouses(id, name, code)
        `)
        .order("transaction_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

// Consignment Products (products marked as consignment)
export const useConsignmentProducts = () => {
  return useQuery({
    queryKey: ["consignment_products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`
          *,
          vendors:consignment_vendor_id(id, name)
        `)
        .eq("is_consignment", true)
        .order("name");
      if (error) throw error;
      return data;
    },
  });
};

// Consignment Summary
export const useConsignmentSummary = () => {
  const { data: transactions = [], isLoading } = useConsignmentTransactions();

  const received = transactions
    .filter((t: any) => t.transaction_type === "received")
    .reduce((sum: number, t: any) => sum + Number(t.quantity), 0);

  const consumed = transactions
    .filter((t: any) => t.transaction_type === "consumed")
    .reduce((sum: number, t: any) => sum + Number(t.quantity), 0);

  const returned = transactions
    .filter((t: any) => t.transaction_type === "returned")
    .reduce((sum: number, t: any) => sum + Number(t.quantity), 0);

  const onHand = received - consumed - returned;

  const totalValue = transactions
    .filter((t: any) => t.transaction_type === "received")
    .reduce((sum: number, t: any) => sum + Number(t.total_value || 0), 0);

  return {
    received,
    consumed,
    returned,
    onHand,
    totalValue,
    transactionCount: transactions.length,
    isLoading,
  };
};

// Create Consignment Transaction
export const useCreateConsignmentTransaction = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      product_id: string;
      vendor_id?: string;
      warehouse_id: string;
      transaction_type: "received" | "consumed" | "returned" | "transferred";
      quantity: number;
      unit_cost?: number;
      transaction_date?: string;
      notes?: string;
    }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      // If no vendor_id provided, get it from the product
      let vendorId = data.vendor_id;
      if (!vendorId) {
        const { data: product } = await supabase
          .from("products")
          .select("consignment_vendor_id")
          .eq("id", data.product_id)
          .single();
        vendorId = product?.consignment_vendor_id;
      }

      if (!vendorId) throw new Error("No vendor associated with this consignment product");

      const { error } = await supabase.from("consignment_transactions").insert({
        org_id: profile.org_id,
        product_id: data.product_id,
        vendor_id: vendorId,
        warehouse_id: data.warehouse_id,
        transaction_type: data.transaction_type,
        quantity: data.quantity,
        unit_cost: data.unit_cost || 0,
        transaction_date: data.transaction_date || new Date().toISOString().split("T")[0],
        notes: data.notes,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["consignment_transactions"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_stock"] });
      toast({ title: "Consignment transaction recorded" });
    },
    onError: (error) => {
      toast({ 
        title: "Error recording transaction", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
};