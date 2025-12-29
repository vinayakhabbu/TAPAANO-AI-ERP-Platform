import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { captureDecisionTrace, type DecisionType } from "@/hooks/useDecisionLedger";

type ApprovalAction = "approve" | "reject" | "submit_for_approval";

interface ApprovalResult {
  success: boolean;
  error?: string;
}

// Helper to get org_id from current user's profile
const getOrgId = async (): Promise<string | null> => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  
  const { data: profile } = await supabase
    .from("profiles")
    .select("org_id")
    .eq("id", user.id)
    .single();
  
  return profile?.org_id || null;
};

// Purchase Order Approval with Decision Ledger
export const usePurchaseOrderApproval = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, action, rationale }: { id: string; action: ApprovalAction; rationale?: string }): Promise<ApprovalResult> => {
      // First, fetch current PO state for the decision trace
      const { data: currentPO } = await supabase
        .from("purchase_orders")
        .select("*, vendors(name)")
        .eq("id", id)
        .single();

      let newStatus: string;
      let decisionType: DecisionType;
      
      switch (action) {
        case "submit_for_approval":
          newStatus = "pending_approval";
          decisionType = "po_approval";
          break;
        case "approve":
          newStatus = "approved";
          decisionType = "po_approval";
          break;
        case "reject":
          newStatus = "draft";
          decisionType = "po_rejection";
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

      // Capture decision trace
      const orgId = await getOrgId();
      if (orgId && currentPO) {
        await captureDecisionTrace(orgId, {
          decision_type: decisionType,
          source_type: "purchase_order",
          source_id: id,
          approval_status: action === "submit_for_approval" ? "pending" : action === "approve" ? "approved" : "rejected",
          input_snapshot: {
            po_number: currentPO.po_number,
            vendor_name: currentPO.vendors?.name,
            total: currentPO.total,
            previous_status: currentPO.status,
          },
          commit_writes: [{
            entity: "purchase_order",
            id,
            field: "status",
            before: currentPO.status,
            after: newStatus,
          }],
          rationale_text: rationale,
          entities: [
            { entity_type: "purchase_order", entity_id: id, entity_label: currentPO.po_number },
            ...(currentPO.vendor_id ? [{ entity_type: "vendor", entity_id: currentPO.vendor_id, entity_label: currentPO.vendors?.name }] : []),
          ],
        });
      }

      return { success: true };
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      queryClient.invalidateQueries({ queryKey: ["decision-traces"] });
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

// Payment Run Approval with Decision Ledger
export const usePaymentRunApproval = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, action, rationale }: { id: string; action: ApprovalAction; rationale?: string }): Promise<ApprovalResult> => {
      // Fetch current payment run state
      const { data: currentRun } = await supabase
        .from("payment_runs")
        .select("*")
        .eq("id", id)
        .single();

      let newStatus: string;
      let decisionType: DecisionType;
      
      switch (action) {
        case "submit_for_approval":
          newStatus = "pending_approval";
          decisionType = "payment_approval";
          break;
        case "approve":
          newStatus = "approved";
          decisionType = "payment_approval";
          break;
        case "reject":
          newStatus = "draft";
          decisionType = "payment_rejection";
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

      // Capture decision trace
      const orgId = await getOrgId();
      if (orgId && currentRun) {
        await captureDecisionTrace(orgId, {
          decision_type: decisionType,
          source_type: "payment_run",
          source_id: id,
          approval_status: action === "submit_for_approval" ? "pending" : action === "approve" ? "approved" : "rejected",
          input_snapshot: {
            run_number: currentRun.run_number,
            total_amount: currentRun.total_amount,
            payment_method: currentRun.payment_method,
            previous_status: currentRun.status,
          },
          commit_writes: [{
            entity: "payment_run",
            id,
            field: "status",
            before: currentRun.status,
            after: newStatus,
          }],
          rationale_text: rationale,
          entities: [
            { entity_type: "payment_run", entity_id: id, entity_label: currentRun.run_number },
          ],
        });
      }

      return { success: true };
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["payment_runs"] });
      queryClient.invalidateQueries({ queryKey: ["decision-traces"] });
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

// Journal Entry Approval (Post/Reverse) with Decision Ledger
export const useJournalEntryApproval = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, action, rationale }: { id: string; action: "post" | "reverse"; rationale?: string }): Promise<ApprovalResult> => {
      // Fetch current journal entry state
      const { data: currentEntry } = await supabase
        .from("journal_entries")
        .select("*")
        .eq("id", id)
        .single();

      const newStatus = action === "post" ? "posted" : "reversed";
      const decisionType: DecisionType = action === "post" ? "journal_post" : "journal_reverse";
      
      const updateData: Record<string, unknown> = { status: newStatus };
      
      if (action === "post") {
        updateData.posted_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("journal_entries")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      // Capture decision trace
      const orgId = await getOrgId();
      if (orgId && currentEntry) {
        await captureDecisionTrace(orgId, {
          decision_type: decisionType,
          source_type: "journal_entry",
          source_id: id,
          approval_status: "approved",
          input_snapshot: {
            entry_number: currentEntry.entry_number,
            memo: currentEntry.memo,
            previous_status: currentEntry.status,
          },
          commit_writes: [{
            entity: "journal_entry",
            id,
            field: "status",
            before: currentEntry.status,
            after: newStatus,
          }],
          rationale_text: rationale,
          entities: [
            { entity_type: "journal_entry", entity_id: id, entity_label: currentEntry.entry_number },
          ],
        });
      }

      return { success: true };
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["journal-entries"] });
      queryClient.invalidateQueries({ queryKey: ["account-balances"] });
      queryClient.invalidateQueries({ queryKey: ["journal-data-for-reports"] });
      queryClient.invalidateQueries({ queryKey: ["decision-traces"] });
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

// Bill Status Update with Decision Ledger
export const useBillStatusUpdate = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, status, rationale }: { id: string; status: "draft" | "pending" | "paid" | "overdue" | "cancelled"; rationale?: string }): Promise<ApprovalResult> => {
      // Fetch current bill state
      const { data: currentBill } = await supabase
        .from("bills")
        .select("*, vendors(name)")
        .eq("id", id)
        .single();

      const { error } = await supabase
        .from("bills")
        .update({ status })
        .eq("id", id);

      if (error) throw error;

      // Capture decision trace
      const orgId = await getOrgId();
      if (orgId && currentBill) {
        await captureDecisionTrace(orgId, {
          decision_type: "bill_status_change",
          source_type: "bill",
          source_id: id,
          approval_status: "approved",
          input_snapshot: {
            bill_number: currentBill.bill_number,
            vendor_name: currentBill.vendors?.name,
            total: currentBill.total,
            previous_status: currentBill.status,
            new_status: status,
          },
          commit_writes: [{
            entity: "bill",
            id,
            field: "status",
            before: currentBill.status,
            after: status,
          }],
          rationale_text: rationale,
          entities: [
            { entity_type: "bill", entity_id: id, entity_label: currentBill.bill_number },
            ...(currentBill.vendor_id ? [{ entity_type: "vendor", entity_id: currentBill.vendor_id, entity_label: currentBill.vendors?.name }] : []),
          ],
        });
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["decision-traces"] });
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

// Process Payment Run with Decision Ledger
export const useProcessPaymentRun = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, rationale }: { id: string; rationale?: string }): Promise<ApprovalResult> => {
      // Fetch current payment run state
      const { data: currentRun } = await supabase
        .from("payment_runs")
        .select("*")
        .eq("id", id)
        .single();

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

      // Capture decision trace
      const orgId = await getOrgId();
      if (orgId && currentRun) {
        await captureDecisionTrace(orgId, {
          decision_type: "payment_processing",
          source_type: "payment_run",
          source_id: id,
          approval_status: "approved",
          input_snapshot: {
            run_number: currentRun.run_number,
            total_amount: currentRun.total_amount,
            payment_method: currentRun.payment_method,
            previous_status: currentRun.status,
          },
          commit_writes: [{
            entity: "payment_run",
            id,
            field: "status",
            before: currentRun.status,
            after: "completed",
          }],
          rationale_text: rationale,
          entities: [
            { entity_type: "payment_run", entity_id: id, entity_label: currentRun.run_number },
          ],
        });
      }

      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment_runs"] });
      queryClient.invalidateQueries({ queryKey: ["bills"] });
      queryClient.invalidateQueries({ queryKey: ["decision-traces"] });
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
