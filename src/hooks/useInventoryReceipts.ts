import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { captureDecisionTrace } from "./useDecisionLedger";
// Inventory Receipts with joins
export const useInventoryReceipts = () => {
  return useQuery({
    queryKey: ["inventory_receipts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("inventory_receipts")
        .select(`
          *,
          warehouses(id, name, code)
        `)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
};

// Inventory Receipt Lines
export const useInventoryReceiptLines = (receiptId?: string) => {
  return useQuery({
    queryKey: ["inventory_receipt_lines", receiptId],
    queryFn: async () => {
      if (!receiptId) return [];
      const { data, error } = await supabase
        .from("inventory_receipt_lines")
        .select(`
          *,
          products(id, sku, name)
        `)
        .eq("receipt_id", receiptId);
      if (error) throw error;
      return data;
    },
    enabled: !!receiptId,
  });
};

// Create Inventory Receipt with lines
export const useCreateInventoryReceipt = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      warehouse_id: string;
      receipt_type: string;
      receipt_date?: string;
      notes?: string;
      lines: Array<{
        product_id: string;
        quantity: number;
        unit_cost: number;
        reason?: string;
      }>;
    }) => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("org_id")
        .single();

      if (!profile?.org_id) throw new Error("No organization found");

      const receiptNumber = `IR-${Date.now().toString().slice(-8)}`;

      // Create receipt header
      const { data: receipt, error: receiptError } = await supabase
        .from("inventory_receipts")
        .insert({
          org_id: profile.org_id,
          receipt_number: receiptNumber,
          warehouse_id: data.warehouse_id,
          receipt_type: data.receipt_type,
          receipt_date: data.receipt_date || new Date().toISOString().split("T")[0],
          notes: data.notes,
          status: "draft",
        })
        .select()
        .single();

      if (receiptError) throw receiptError;

      // Create receipt lines
      const linesData = data.lines.map(line => ({
        receipt_id: receipt.id,
        product_id: line.product_id,
        quantity: line.quantity,
        unit_cost: line.unit_cost,
        reason: line.reason,
      }));

      const { error: linesError } = await supabase
        .from("inventory_receipt_lines")
        .insert(linesData);

      if (linesError) throw linesError;

      return receipt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_receipts"] });
      toast({ title: "Inventory receipt created" });
    },
    onError: (error) => {
      toast({ 
        title: "Error creating receipt", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
};

// Post Inventory Receipt (updates inventory)
export const usePostInventoryReceipt = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (receiptId: string) => {
      // Get receipt details first
      const { data: receipt } = await supabase
        .from("inventory_receipts")
        .select("*, warehouses(name)")
        .eq("id", receiptId)
        .single();

      const { error } = await supabase
        .from("inventory_receipts")
        .update({ status: "posted" })
        .eq("id", receiptId);

      if (error) throw error;

      // Capture decision trace
      if (receipt?.org_id) {
        await captureDecisionTrace(receipt.org_id, {
          decision_type: "inventory_receipt_posted",
          source_type: "inventory_receipt",
          source_id: receiptId,
          approval_status: "approved",
          approval_channel: "human",
          input_snapshot: {
            receipt_number: receipt.receipt_number,
            warehouse_name: receipt.warehouses?.name,
            receipt_type: receipt.receipt_type,
            receipt_date: receipt.receipt_date,
          },
          rationale_text: `Inventory receipt ${receipt.receipt_number} posted to update stock`,
          commit_writes: [{
            entity: "inventory_receipts",
            id: receiptId,
            field: "status",
            before: receipt.status,
            after: "posted",
          }],
          entities: [{
            entity_type: "warehouse",
            entity_id: receipt.warehouse_id,
            entity_label: receipt.warehouses?.name,
          }],
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_receipts"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_stock"] });
      queryClient.invalidateQueries({ queryKey: ["inventory_transactions"] });
      toast({ title: "Receipt posted - inventory updated" });
    },
    onError: (error) => {
      toast({ 
        title: "Error posting receipt", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
};

// Cancel Inventory Receipt
export const useCancelInventoryReceipt = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (receiptId: string) => {
      const { error } = await supabase
        .from("inventory_receipts")
        .update({ status: "cancelled" })
        .eq("id", receiptId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["inventory_receipts"] });
      toast({ title: "Receipt cancelled" });
    },
    onError: (error) => {
      toast({ 
        title: "Error cancelling receipt", 
        description: error.message, 
        variant: "destructive" 
      });
    },
  });
};