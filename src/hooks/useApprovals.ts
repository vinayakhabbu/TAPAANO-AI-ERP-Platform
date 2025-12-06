import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type ApprovalAction = "approve" | "reject" | "submit_for_approval";

interface ApprovalResult {
  success: boolean;
  error?: string;
}

// Purchase Order Approval
export const usePurchaseOrderApproval = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: ApprovalAction }): Promise<ApprovalResult> => {
      let newStatus: string;
      
      switch (action) {
        case "submit_for_approval":
          newStatus = "pending_approval";
          break;
        case "approve":
          newStatus = "approved";
          break;
        case "reject":
          newStatus = "draft";
          break;
        default:
          throw new Error("Invalid action");
      }

      const updateData: Record<string, unknown> = { status: newStatus };
      
      if (action === "approve") {
        const { data: { user } } = await supabase.auth.getUser();
        updateData.approved_by = user?.id;
        updateData.approved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("purchase_orders")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      const messages = {
        submit_for_approval: "Purchase order submitted for approval",
        approve: "Purchase order approved",
        reject: "Purchase order rejected",
      };
      toast({ title: "Success", description: messages[action] });
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to update purchase order",
        variant: "destructive"
      });
    },
  });
};

// Payment Run Approval
export const usePaymentRunApproval = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: ApprovalAction }): Promise<ApprovalResult> => {
      let newStatus: string;
      
      switch (action) {
        case "submit_for_approval":
          newStatus = "pending_approval";
          break;
        case "approve":
          newStatus = "approved";
          break;
        case "reject":
          newStatus = "draft";
          break;
        default:
          throw new Error("Invalid action");
      }

      const updateData: Record<string, unknown> = { status: newStatus };
      
      if (action === "approve") {
        const { data: { user } } = await supabase.auth.getUser();
        updateData.approved_by = user?.id;
        updateData.approved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("payment_runs")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["payment_runs"] });
      const messages = {
        submit_for_approval: "Payment run submitted for approval",
        approve: "Payment run approved",
        reject: "Payment run rejected",
      };
      toast({ title: "Success", description: messages[action] });
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to update payment run",
        variant: "destructive"
      });
    },
  });
};

// Journal Entry Approval (Post/Reverse)
export const useJournalEntryApproval = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "post" | "reverse" }): Promise<ApprovalResult> => {
      const newStatus = action === "post" ? "posted" : "reversed";
      
      const updateData: Record<string, unknown> = { status: newStatus };
      
      if (action === "post") {
        updateData.posted_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("journal_entries")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
      queryClient.invalidateQueries({ queryKey: ["journal-data-for-reports"] });
      const messages = {
        post: "Journal entry posted",
        reverse: "Journal entry reversed",
      };
      toast({ title: "Success", description: messages[action] });
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to update journal entry",
        variant: "destructive"
      });
    },
  });
};

// Bill Status Update
export const useBillStatusUpdate = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "draft" | "pending" | "paid" | "overdue" | "cancelled" }): Promise<ApprovalResult> => {
      const { error } = await supabase
        .from("bills")
        .update({ status })
        .eq("id", id);

      if (error) throw error;
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      toast({ title: "Success", description: "Bill status updated" });
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to update bill",
        variant: "destructive"
      });
    },
  });
};

// Process Payment Run
export const useProcessPaymentRun = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string): Promise<ApprovalResult> => {
      // First set to processing
      const { error: processingError } = await supabase
        .from("payment_runs")
        .update({ status: "processing" })
        .eq("id", id);

      if (processingError) throw processingError;

      // Simulate processing delay, then complete
      await new Promise(resolve => setTimeout(resolve, 1000));

      const { error: completeError } = await supabase
        .from("payment_runs")
        .update({ 
          status: "completed",
          processed_at: new Date().toISOString()
        })
        .eq("id", id);

      if (completeError) throw completeError;
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_runs"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      toast({ title: "Success", description: "Payment run processed successfully" });
    },
    onError: (error) => {
      toast({ 
        title: "Error", 
        description: error instanceof Error ? error.message : "Failed to process payment run",
        variant: "destructive"
      });
    },
  });
};
