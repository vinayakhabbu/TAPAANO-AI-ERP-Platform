import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { toast } from "sonner";

export interface InventoryMovement {
  id: string;
  org_id: string;
  product_id: string;
  warehouse_id: string | null;
  movement_type: string;
  quantity: number;
  unit_cost: number;
  total_cost: number;
  reference_type: string | null;
  reference_id: string | null;
  movement_date: string;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  product?: { sku: string; name: string } | null;
  warehouse?: { code: string; name: string } | null;
}

export interface COGSSummary {
  product_id: string;
  product_name: string;
  product_sku: string;
  total_sales_quantity: number;
  total_cogs: number;
  average_unit_cost: number;
}

export function useInventoryMovements(filters?: { 
  productId?: string; 
  warehouseId?: string; 
  movementType?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['inventory-movements', profile?.org_id, filters],
    queryFn: async () => {
      let query = supabase
        .from('inventory_movements')
        .select(`
          *,
          product:products(sku, name),
          warehouse:warehouses(code, name)
        `)
        .order('movement_date', { ascending: false })
        .limit(200);
      
      if (filters?.productId) {
        query = query.eq('product_id', filters.productId);
      }
      if (filters?.warehouseId) {
        query = query.eq('warehouse_id', filters.warehouseId);
      }
      if (filters?.movementType) {
        query = query.eq('movement_type', filters.movementType);
      }
      if (filters?.dateFrom) {
        query = query.gte('movement_date', filters.dateFrom);
      }
      if (filters?.dateTo) {
        query = query.lte('movement_date', filters.dateTo);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      return data as InventoryMovement[];
    },
    enabled: !!profile?.org_id,
  });
}

export function useCOGSSummary(dateFrom?: string, dateTo?: string) {
  const { profile } = useAuth();
  
  return useQuery({
    queryKey: ['cogs-summary', profile?.org_id, dateFrom, dateTo],
    queryFn: async () => {
      let query = supabase
        .from('inventory_movements')
        .select(`
          product_id,
          quantity,
          total_cost,
          unit_cost,
          product:products(sku, name)
        `)
        .eq('movement_type', 'sale');
      
      if (dateFrom) {
        query = query.gte('movement_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('movement_date', dateTo);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Aggregate by product
      const productMap = new Map<string, COGSSummary>();
      
      (data || []).forEach((movement: any) => {
        const productId = movement.product_id;
        const existing = productMap.get(productId);
        
        if (existing) {
          existing.total_sales_quantity += Math.abs(movement.quantity);
          existing.total_cogs += movement.total_cost;
        } else {
          productMap.set(productId, {
            product_id: productId,
            product_name: movement.product?.name || 'Unknown',
            product_sku: movement.product?.sku || '',
            total_sales_quantity: Math.abs(movement.quantity),
            total_cogs: movement.total_cost,
            average_unit_cost: movement.unit_cost,
          });
        }
      });
      
      // Calculate average cost
      const results = Array.from(productMap.values()).map(item => ({
        ...item,
        average_unit_cost: item.total_sales_quantity > 0 
          ? item.total_cogs / item.total_sales_quantity 
          : 0,
      }));
      
      return results.sort((a, b) => b.total_cogs - a.total_cogs);
    },
    enabled: !!profile?.org_id,
  });
}

export function useCreateInventoryMovement() {
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  
  return useMutation({
    mutationFn: async (data: {
      product_id: string;
      warehouse_id?: string;
      movement_type: string;
      quantity: number;
      unit_cost: number;
      reference_type?: string;
      reference_id?: string;
      movement_date?: string;
      notes?: string;
    }) => {
      if (!profile?.org_id) throw new Error("No organization");
      
      const { data: result, error } = await supabase
        .from('inventory_movements')
        .insert({
          ...data,
          org_id: profile.org_id,
          total_cost: data.quantity * data.unit_cost,
          created_by: profile.id,
        })
        .select()
        .single();
      
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
      queryClient.invalidateQueries({ queryKey: ['cogs-summary'] });
      toast.success("Inventory movement recorded");
    },
    onError: (error: Error) => {
      toast.error(`Failed to record movement: ${error.message}`);
    },
  });
}

export function useProductInventorySummary(productId: string | null) {
  return useQuery({
    queryKey: ['product-inventory-summary', productId],
    queryFn: async () => {
      if (!productId) return null;
      
      const { data, error } = await supabase
        .from('inventory_movements')
        .select('movement_type, quantity, total_cost')
        .eq('product_id', productId);
      
      if (error) throw error;
      
      let totalQuantity = 0;
      let totalValue = 0;
      
      (data || []).forEach(movement => {
        // Positive for inbound, negative for outbound
        const sign = ['purchase', 'transfer_in', 'production_in', 'adjustment'].includes(movement.movement_type) ? 1 : -1;
        totalQuantity += movement.quantity * sign;
        totalValue += movement.total_cost * sign;
      });
      
      return {
        on_hand_quantity: totalQuantity,
        on_hand_value: totalValue,
        average_cost: totalQuantity > 0 ? totalValue / totalQuantity : 0,
      };
    },
    enabled: !!productId,
  });
}
