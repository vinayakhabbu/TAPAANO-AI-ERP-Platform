import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { captureDecisionTrace } from "./useDecisionLedger";
// Work Centers
export const useWorkCenters = () => {
  return useQuery({
    queryKey: ["work-centers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_centers")
        .select("*")
        .order("code");
      if (error) throw error;
      return data;
    },
  });
};

export const useCreateWorkCenter = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (workCenter: {
      code: string;
      name: string;
      description?: string;
      hourly_rate?: number;
      capacity_per_day?: number;
      efficiency_rate?: number;
      org_id: string;
    }) => {
      const { data, error } = await supabase
        .from("work_centers")
        .insert(workCenter)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["work-centers"] });
      toast({ title: "Work center created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating work center", description: error.message, variant: "destructive" });
    },
  });
};

// Bill of Materials
export const useBOMs = () => {
  return useQuery({
    queryKey: ["boms"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bom_headers")
        .select(`
          *,
          product:products(id, name, sku),
          bom_lines(
            id, quantity, unit_of_measure, scrap_rate, position_number,
            component:products(id, name, sku)
          ),
          bom_operations(
            id, operation_number, operation_name, setup_time, run_time_per_unit,
            work_center:work_centers(id, name, code)
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const useCreateBOM = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (bom: {
      org_id: string;
      product_id: string;
      bom_number: string;
      version?: string;
      description?: string;
      standard_quantity?: number;
      lines: Array<{
        component_product_id: string;
        quantity: number;
        unit_of_measure?: string;
        scrap_rate?: number;
        position_number?: number;
      }>;
      operations?: Array<{
        work_center_id: string;
        operation_number: number;
        operation_name: string;
        setup_time?: number;
        run_time_per_unit?: number;
      }>;
    }) => {
      const { lines, operations, ...headerData } = bom;
      
      const { data: header, error: headerError } = await supabase
        .from("bom_headers")
        .insert(headerData)
        .select()
        .single();
      if (headerError) throw headerError;

      if (lines.length > 0) {
        const linesWithBomId = lines.map(line => ({ ...line, bom_id: header.id }));
        const { error: linesError } = await supabase
          .from("bom_lines")
          .insert(linesWithBomId);
        if (linesError) throw linesError;
      }

      if (operations && operations.length > 0) {
        const opsWithBomId = operations.map(op => ({ ...op, bom_id: header.id }));
        const { error: opsError } = await supabase
          .from("bom_operations")
          .insert(opsWithBomId);
        if (opsError) throw opsError;
      }

      return header;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["boms"] });
      toast({ title: "BOM created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating BOM", description: error.message, variant: "destructive" });
    },
  });
};

// Production Orders
export const useProductionOrders = () => {
  return useQuery({
    queryKey: ["production-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_orders")
        .select(`
          *,
          product:products(id, name, sku, planning_strategy),
          bom:bom_headers(id, bom_number, version),
          warehouse:warehouses(id, name, code),
          sales_order:sales_orders(id, so_number),
          components:production_order_components(
            id, required_quantity, issued_quantity, is_backflushed,
            product:products(id, name, sku)
          ),
          operations:production_order_operations(
            id, operation_number, operation_name, status, planned_setup_time, planned_run_time,
            work_center:work_centers(id, name, code)
          )
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const useCreateProductionOrder = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (order: {
      org_id: string;
      entity_id: string;
      order_number: string;
      bom_id: string;
      product_id: string;
      warehouse_id?: string;
      planned_quantity: number;
      priority?: number;
      planned_start_date?: string;
      planned_end_date?: string;
      notes?: string;
      sales_order_id?: string;
      sales_order_item_id?: string;
    }) => {
      // Get product to check planning strategy
      const { data: product, error: prodError } = await supabase
        .from("products")
        .select("planning_strategy")
        .eq("id", order.product_id)
        .single();
      if (prodError) throw prodError;

      // Validate MTO requires sales order ref
      if (product.planning_strategy === 'mto' && !order.sales_order_id) {
        throw new Error("MTO products require a sales order reference");
      }
      // Validate MTS should not have sales order ref
      if (product.planning_strategy === 'mts' && order.sales_order_id) {
        throw new Error("MTS products should not be linked to a sales order");
      }

      // Create production order
      const { data: prodOrder, error: orderError } = await supabase
        .from("production_orders")
        .insert(order)
        .select()
        .single();
      if (orderError) throw orderError;

      // Get BOM lines and create components
      const { data: bomLines, error: bomError } = await supabase
        .from("bom_lines")
        .select("*, component:products(standard_cost)")
        .eq("bom_id", order.bom_id);
      if (bomError) throw bomError;

      if (bomLines && bomLines.length > 0) {
        const components = bomLines.map(line => ({
          production_order_id: prodOrder.id,
          product_id: line.component_product_id,
          required_quantity: line.quantity * order.planned_quantity * (1 + (line.scrap_rate || 0) / 100),
          unit_cost: line.component?.standard_cost || 0,
        }));
        
        const { error: compError } = await supabase
          .from("production_order_components")
          .insert(components);
        if (compError) throw compError;
      }

      // Get BOM operations and create order operations
      const { data: bomOps, error: opsError } = await supabase
        .from("bom_operations")
        .select("*")
        .eq("bom_id", order.bom_id);
      if (opsError) throw opsError;

      if (bomOps && bomOps.length > 0) {
        const operations = bomOps.map(op => ({
          production_order_id: prodOrder.id,
          work_center_id: op.work_center_id,
          operation_number: op.operation_number,
          operation_name: op.operation_name,
          planned_setup_time: op.setup_time,
          planned_run_time: op.run_time_per_unit * order.planned_quantity,
        }));
        
        const { error: opError } = await supabase
          .from("production_order_operations")
          .insert(operations);
        if (opError) throw opError;
      }

      return prodOrder;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
      toast({ title: "Production order created successfully" });
    },
    onError: (error) => {
      toast({ title: "Error creating production order", description: error.message, variant: "destructive" });
    },
  });
};

// Post Goods Receipt from Production (MTS/MTO aware)
export const usePostProductionGoodsReceipt = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      org_id, 
      production_order_id, 
      quantity, 
      warehouse_id 
    }: { 
      org_id: string;
      production_order_id: string;
      quantity: number;
      warehouse_id?: string;
    }) => {
      // Get production order details
      const { data: order } = await supabase
        .from("production_orders")
        .select("*, product:products(name)")
        .eq("id", production_order_id)
        .single();

      const { data, error } = await supabase.rpc('post_production_goods_receipt', {
        p_org_id: org_id,
        p_production_order_id: production_order_id,
        p_quantity: quantity,
        p_warehouse_id: warehouse_id || null,
      });
      if (error) throw error;

      // Capture decision trace
      await captureDecisionTrace(org_id, {
        decision_type: "production_goods_receipt",
        source_type: "production_order",
        source_id: production_order_id,
        approval_status: "approved",
        approval_channel: "human",
        input_snapshot: {
          order_number: order?.order_number,
          product_name: order?.product?.name,
          quantity_received: quantity,
          warehouse_id,
        },
        rationale_text: `Goods receipt posted for ${quantity} units from production order ${order?.order_number}`,
        entities: [
          {
            entity_type: "production_order",
            entity_id: production_order_id,
            entity_label: order?.order_number,
          },
          {
            entity_type: "product",
            entity_id: order?.product_id,
            entity_label: order?.product?.name,
          },
        ],
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
      queryClient.invalidateQueries({ queryKey: ["production-goods-receipts"] });
      toast({ title: "Goods receipt posted successfully" });
    },
    onError: (error) => {
      toast({ title: "Error posting goods receipt", description: error.message, variant: "destructive" });
    },
  });
};

// Production Goods Receipts
export const useProductionGoodsReceipts = () => {
  return useQuery({
    queryKey: ["production-goods-receipts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("production_goods_receipts")
        .select(`
          *,
          production_order:production_orders(id, order_number),
          product:products(id, name, sku),
          warehouse:warehouses(id, name),
          sales_order:sales_orders(id, order_number)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

export const useUpdateProductionOrderStatus = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status, completed_quantity }: { 
      id: string; 
      status: string;
      completed_quantity?: number;
    }) => {
      // Get production order details first
      const { data: order } = await supabase
        .from("production_orders")
        .select("*, product:products(name)")
        .eq("id", id)
        .single();

      const updateData: Record<string, unknown> = { status };
      if (status === 'in_progress') {
        updateData.actual_start_date = new Date().toISOString().split('T')[0];
      }
      if (completed_quantity !== undefined) {
        updateData.completed_quantity = completed_quantity;
      }
      
      const { data, error } = await supabase
        .from("production_orders")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;

      // Capture decision trace
      if (order?.org_id) {
        await captureDecisionTrace(order.org_id, {
          decision_type: "production_order_status_change",
          source_type: "production_order",
          source_id: id,
          approval_status: "approved",
          approval_channel: "human",
          input_snapshot: {
            order_number: order.order_number,
            product_name: order.product?.name,
            planned_quantity: order.planned_quantity,
            completed_quantity,
            previous_status: order.status,
            new_status: status,
          },
          rationale_text: `Production order ${order.order_number} status changed from ${order.status} to ${status}`,
          commit_writes: [{
            entity: "production_orders",
            id,
            field: "status",
            before: order.status,
            after: status,
          }],
          entities: [{
            entity_type: "product",
            entity_id: order.product_id,
            entity_label: order.product?.name,
          }],
        });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stock"] });
      toast({ title: "Production order updated" });
    },
    onError: (error) => {
      toast({ title: "Error updating order", description: error.message, variant: "destructive" });
    },
  });
};

// MRP Runs
export const useMRPRuns = () => {
  return useQuery({
    queryKey: ["mrp-runs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("mrp_runs")
        .select(`
          *,
          results:mrp_results(
            id, requirement_date, gross_requirement, net_requirement, planned_order_qty,
            product:products(id, name, sku)
          )
        `)
        .order("run_date", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });
};

export const useRunMRP = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ org_id, planning_horizon_days }: { org_id: string; planning_horizon_days: number }) => {
      // Create MRP run
      const runNumber = `MRP-${Date.now()}`;
      const { data: mrpRun, error: runError } = await supabase
        .from("mrp_runs")
        .insert({ 
          org_id, 
          run_number: runNumber,
          planning_horizon_days,
          status: 'running'
        })
        .select()
        .single();
      if (runError) throw runError;

      // Get production orders that are planned or released
      const { data: orders, error: ordersError } = await supabase
        .from("production_orders")
        .select("*, components:production_order_components(*)")
        .in("status", ["planned", "released"])
        .eq("org_id", org_id);
      if (ordersError) throw ordersError;

      // Get current inventory
      const { data: inventory, error: invError } = await supabase
        .from("inventory_stock")
        .select("*")
        .eq("org_id", org_id);
      if (invError) throw invError;

      // Calculate requirements
      const results: Array<{
        mrp_run_id: string;
        product_id: string;
        requirement_date: string;
        gross_requirement: number;
        scheduled_receipts: number;
        projected_on_hand: number;
        net_requirement: number;
        planned_order_qty: number;
        source_type: string;
        source_id: string;
      }> = [];
      
      let totalRequirements = 0;
      let totalShortages = 0;

      orders?.forEach(order => {
        order.components?.forEach((comp: { product_id: string; required_quantity: number; issued_quantity: number }) => {
          const invItem = inventory?.find(i => i.product_id === comp.product_id);
          const onHand = invItem?.quantity_on_hand || 0;
          const required = comp.required_quantity - comp.issued_quantity;
          const netReq = Math.max(0, required - onHand);
          
          totalRequirements++;
          if (netReq > 0) totalShortages++;
          
          results.push({
            mrp_run_id: mrpRun.id,
            product_id: comp.product_id,
            requirement_date: order.planned_start_date || new Date().toISOString().split('T')[0],
            gross_requirement: required,
            scheduled_receipts: 0,
            projected_on_hand: onHand,
            net_requirement: netReq,
            planned_order_qty: netReq,
            source_type: 'production_order',
            source_id: order.id,
          });
        });
      });

      if (results.length > 0) {
        const { error: resultsError } = await supabase
          .from("mrp_results")
          .insert(results);
        if (resultsError) throw resultsError;
      }

      // Update run as completed
      const { error: updateError } = await supabase
        .from("mrp_runs")
        .update({ 
          status: 'completed', 
          completed_at: new Date().toISOString(),
          total_requirements: totalRequirements,
          total_shortages: totalShortages
        })
        .eq("id", mrpRun.id);
      if (updateError) throw updateError;

      return mrpRun;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mrp-runs"] });
      toast({ title: "MRP run completed" });
    },
    onError: (error) => {
      toast({ title: "Error running MRP", description: error.message, variant: "destructive" });
    },
  });
};

// Capacity Schedules
export const useCapacitySchedules = (startDate?: string, endDate?: string) => {
  return useQuery({
    queryKey: ["capacity-schedules", startDate, endDate],
    queryFn: async () => {
      let query = supabase
        .from("capacity_schedules")
        .select(`
          *,
          work_center:work_centers(id, name, code, capacity_per_day)
        `)
        .order("schedule_date");
      
      if (startDate) query = query.gte("schedule_date", startDate);
      if (endDate) query = query.lte("schedule_date", endDate);
      
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
  });
};

export const useGenerateCapacitySchedule = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ org_id, start_date, end_date }: { 
      org_id: string; 
      start_date: string; 
      end_date: string;
    }) => {
      // Get work centers
      const { data: workCenters, error: wcError } = await supabase
        .from("work_centers")
        .select("*")
        .eq("org_id", org_id)
        .eq("is_active", true);
      if (wcError) throw wcError;

      // Get production order operations
      const { data: operations, error: opsError } = await supabase
        .from("production_order_operations")
        .select(`
          *,
          production_order:production_orders!inner(org_id, planned_start_date, planned_end_date, status)
        `)
        .in("status", ["pending", "in_progress"]);
      if (opsError) throw opsError;

      // Generate schedules for each work center and date
      const schedules: Array<{
        org_id: string;
        work_center_id: string;
        schedule_date: string;
        available_hours: number;
        planned_hours: number;
      }> = [];

      const start = new Date(start_date);
      const end = new Date(end_date);

      workCenters?.forEach(wc => {
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          const plannedHours = operations
            ?.filter(op => 
              op.work_center_id === wc.id && 
              op.production_order?.org_id === org_id
            )
            .reduce((sum, op) => sum + (op.planned_setup_time || 0) + (op.planned_run_time || 0), 0) || 0;

          schedules.push({
            org_id,
            work_center_id: wc.id,
            schedule_date: dateStr,
            available_hours: wc.capacity_per_day,
            planned_hours: plannedHours / 60, // Convert to hours
          });
        }
      });

      // Upsert schedules
      const { error: insertError } = await supabase
        .from("capacity_schedules")
        .upsert(schedules, { onConflict: "work_center_id,schedule_date" });
      if (insertError) throw insertError;

      return schedules;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["capacity-schedules"] });
      toast({ title: "Capacity schedule generated" });
    },
    onError: (error) => {
      toast({ title: "Error generating schedule", description: error.message, variant: "destructive" });
    },
  });
};

// Update operation status (shop floor control)
export const useUpdateOperationStatus = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status, actual_setup_time, actual_run_time }: { 
      id: string; 
      status: string;
      actual_setup_time?: number;
      actual_run_time?: number;
    }) => {
      const updateData: Record<string, unknown> = { status };
      if (status === 'in_progress') {
        updateData.started_at = new Date().toISOString();
      }
      if (status === 'completed') {
        updateData.completed_at = new Date().toISOString();
      }
      if (actual_setup_time !== undefined) updateData.actual_setup_time = actual_setup_time;
      if (actual_run_time !== undefined) updateData.actual_run_time = actual_run_time;
      
      const { data, error } = await supabase
        .from("production_order_operations")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["production-orders"] });
      toast({ title: "Operation status updated" });
    },
    onError: (error) => {
      toast({ title: "Error updating operation", description: error.message, variant: "destructive" });
    },
  });
};
