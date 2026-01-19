import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { captureDecisionTrace } from "./useDecisionLedger";
// Warehouses
export const useWarehouses = () => {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
};

// Products
export const useProducts = () => {
  return useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
};

// Inventory Stock with joins
export const useInventoryStock = () => {
  return useQuery({
    queryKey: ["inventory_stock"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_stock")
        .select(`
          *,
          products(id, sku, name, unit_of_measure, valuation_method, reorder_point),
          warehouses(id, name, code)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

// Stock Transfers with joins
export const useStockTransfers = () => {
  return useQuery({
    queryKey: ["stock_transfers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("stock_transfers")
        .select(`
          *,
          from_warehouse:warehouses!stock_transfers_from_warehouse_id_fkey(id, name, code),
          to_warehouse:warehouses!stock_transfers_to_warehouse_id_fkey(id, name, code)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

// Cycle Counts with joins
export const useCycleCounts = () => {
  return useQuery({
    queryKey: ["cycle_counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cycle_counts")
        .select(`
          *,
          warehouses(id, name, code)
        `)
        .order("scheduled_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

// Serial Numbers
export const useSerialNumbers = () => {
  return useQuery({
    queryKey: ["serial_numbers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("serial_numbers")
        .select(`
          *,
          products(id, sku, name),
          warehouses(id, name, code)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

// Batch Lots
export const useBatchLots = () => {
  return useQuery({
    queryKey: ["batch_lots"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("batch_lots")
        .select(`
          *,
          products(id, sku, name),
          warehouses(id, name, code)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

// Bin Locations
export const useBinLocations = (warehouseId?: string) => {
  return useQuery({
    queryKey: ["bin_locations", warehouseId],
    queryFn: async () => {
      let query = supabase
        .from("bin_locations")
        .select(`*, warehouses(id, name, code)`)
        .order("code");

      if (warehouseId) {
        query = query.eq("warehouse_id", warehouseId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
};

// Inventory Transactions
export const useInventoryTransactions = () => {
  return useQuery({
    queryKey: ["inventory_transactions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_transactions")
        .select(`
          *,
          products(id, sku, name),
          warehouses(id, name, code)
        `)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
};

// Inventory Summary hook
export const useInventorySummary = () => {
  const { data: stock = [], isLoading: stockLoading } = useInventoryStock();
  const { data: products = [], isLoading: productsLoading } = useProducts();
  const { data: warehouses = [], isLoading: warehousesLoading } = useWarehouses();
  const { data: transfers = [], isLoading: transfersLoading } = useStockTransfers();

  const totalValue = stock.reduce((sum, s: any) => sum + Number(s.total_value || 0), 0);
  const totalItems = stock.reduce((sum, s: any) => sum + Number(s.quantity_on_hand || 0), 0);
  const lowStockItems = stock.filter((s: any) => {
    const product = s.products;
    return product?.reorder_point && Number(s.quantity_on_hand) <= Number(product.reorder_point);
  }).length;
  const pendingTransfers = transfers.filter((t: any) => t.status === "pending" || t.status === "in_transit").length;

  return {
    totalValue,
    totalItems,
    lowStockItems,
    pendingTransfers,
    warehouseCount: warehouses.length,
    productCount: products.length,
    isLoading: stockLoading || productsLoading || warehousesLoading || transfersLoading,
  };
};

// Create Warehouse mutation
export const useCreateWarehouse = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: { name: string; code: string; address?: string }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      const { error } = await supabase.from("warehouses").insert({
        org_id: profile.org_id,
        ...data,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["warehouses"] });
      toast({ title: "Warehouse created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating warehouse", description: error.message, variant: "destructive" });
    },
  });
};

// Create Product mutation
export const useCreateProduct = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      sku: string;
      name: string;
      description?: string;
      unit_of_measure?: string;
      valuation_method?: "fifo" | "lifo" | "average";
      standard_cost?: number;
      reorder_point?: number;
      reorder_quantity?: number;
      is_serialized?: boolean;
      is_batch_tracked?: boolean;
    }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      const { error } = await supabase.from("products").insert({
        org_id: profile.org_id,
        ...data,
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["products"] });
      toast({ title: "Product created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating product", description: error.message, variant: "destructive" });
    },
  });
};

// Create Stock Transfer mutation
export const useCreateStockTransfer = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      from_warehouse_id: string;
      to_warehouse_id: string;
      transfer_date?: string;
      expected_arrival_date?: string;
      notes?: string;
    }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      const transferNumber = `TRF-${Date.now().toString().slice(-6)}`;

      // Get warehouse names for the decision trace
      const { data: fromWarehouse } = await supabase
        .from("warehouses")
        .select("name")
        .eq("id", data.from_warehouse_id)
        .single();
      
      const { data: toWarehouse } = await supabase
        .from("warehouses")
        .select("name")
        .eq("id", data.to_warehouse_id)
        .single();

      const { data: transfer, error } = await supabase.from("stock_transfers").insert({
        org_id: profile.org_id,
        transfer_number: transferNumber,
        ...data,
      }).select().single();

      if (error) throw error;

      // Capture decision trace
      await captureDecisionTrace(profile.org_id, {
        decision_type: "stock_transfer_created",
        source_type: "stock_transfer",
        source_id: transfer.id,
        approval_status: "approved",
        approval_channel: "human",
        input_snapshot: {
          transfer_number: transferNumber,
          from_warehouse: fromWarehouse?.name,
          to_warehouse: toWarehouse?.name,
          transfer_date: data.transfer_date,
          expected_arrival_date: data.expected_arrival_date,
          notes: data.notes,
        },
        rationale_text: `Stock transfer ${transferNumber} created from ${fromWarehouse?.name} to ${toWarehouse?.name}`,
        entities: [
          {
            entity_type: "warehouse",
            entity_id: data.from_warehouse_id,
            entity_label: fromWarehouse?.name,
          },
          {
            entity_type: "warehouse",
            entity_id: data.to_warehouse_id,
            entity_label: toWarehouse?.name,
          },
        ],
      });

      return transfer;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["stock_transfers"] });
      toast({ title: "Transfer created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating transfer", description: error.message, variant: "destructive" });
    },
  });
};

// Create Cycle Count mutation
export const useCreateCycleCount = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      warehouse_id: string;
      scheduled_date: string;
      notes?: string;
    }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      const countNumber = `CC-${Date.now().toString().slice(-6)}`;

      // Get warehouse name
      const { data: warehouse } = await supabase
        .from("warehouses")
        .select("name")
        .eq("id", data.warehouse_id)
        .single();

      const { data: cycleCount, error } = await supabase.from("cycle_counts").insert({
        org_id: profile.org_id,
        count_number: countNumber,
        ...data,
      }).select().single();

      if (error) throw error;

      // Capture decision trace
      await captureDecisionTrace(profile.org_id, {
        decision_type: "cycle_count_completed",
        source_type: "cycle_count",
        source_id: cycleCount.id,
        approval_status: "approved",
        approval_channel: "human",
        input_snapshot: {
          count_number: countNumber,
          warehouse_name: warehouse?.name,
          scheduled_date: data.scheduled_date,
          notes: data.notes,
        },
        rationale_text: `Cycle count ${countNumber} scheduled for ${warehouse?.name}`,
        entities: [{
          entity_type: "warehouse",
          entity_id: data.warehouse_id,
          entity_label: warehouse?.name,
        }],
      });

      return cycleCount;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cycle_counts"] });
      toast({ title: "Cycle count scheduled" });
    },
    onError: (error) => {
      toast({ title: "Error creating cycle count", description: error.message, variant: "destructive" });
    },
  });
};
