import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { captureDecisionTrace, type DecisionType, type PrecedentReference } from "@/hooks/useDecisionLedger";
import { 
  evaluatePurchaseOrderPolicy, 
  evaluatePaymentRunPolicy, 
  evaluateJournalEntryPolicy,
  type PolicyEvaluation 
} from "@/lib/policyRules";
import { evaluateAutoApproval, type AutoApprovalResult } from "@/lib/autoApproval";

type ApprovalAction = "approve" | "reject" | "submit_for_approval";

interface ApprovalResult {
  success: boolean;
  error?: string;
  autoApproved?: boolean;
  autoApprovalResult?: AutoApprovalResult;
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

// Helper to find similar precedents
const findPrecedents = async (
  orgId: string,
  decisionType: DecisionType,
  sourceType: string
): Promise<PrecedentReference[]> => {
  const { data: precedents } = await supabase
    .from("decision_traces")
    .select("id, input_snapshot, rationale_text")
    .eq("org_id", orgId)
    .eq("decision_type", decisionType)
    .eq("source_type", sourceType)
    .in("approval_status", ["approved", "rejected"])
    .order("created_at", { ascending: false })
    .limit(3);

  if (!precedents || precedents.length === 0) return [];

  // Simple similarity scoring based on matching fields
  return precedents.map((p, idx) => ({
    decision_id: p.id,
    similarity: Math.round((0.9 - idx * 0.15) * 100) / 100, // Mock similarity: 0.90, 0.75, 0.60
    note: p.rationale_text?.slice(0, 50) || undefined,
  }));
};

// Purchase Order Approval with Decision Ledger
export const usePurchaseOrderApproval = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, action, rationale, tryAutoApprove = false }: { id: string; action: ApprovalAction; rationale?: string; tryAutoApprove?: boolean }): Promise<ApprovalResult> => {
      // First, fetch current PO state for the decision trace
      const { data: currentPO } = await supabase
        .from("purchase_orders")
        .select("*, vendors(name)")
        .eq("id", id)
        .single();

      const orgId = await getOrgId();
      
      // Evaluate policies first
      const policyEvaluation = evaluatePurchaseOrderPolicy(
        currentPO?.total || 0,
        currentPO?.vendors?.name,
        currentPO?.status
      );

      // Find precedents
      const precedentsReferenced = orgId ? await findPrecedents(
        orgId,
        "po_approval",
        "purchase_order"
      ) : [];

      // Phase 2: Evaluate auto-approval if submitting for approval
      let autoApprovalResult: AutoApprovalResult | undefined;
      let effectiveAction = action;

      if (action === "submit_for_approval" && tryAutoApprove) {
        // Fetch config from database
        const { data: configData } = orgId ? await supabase
          .from("auto_approval_configs")
          .select("*")
          .eq("org_id", orgId)
          .eq("decision_type", "po_approval")
          .single() : { data: null };
        
        const config = configData ? {
          minPrecedentSimilarity: configData.min_precedent_similarity,
          minPrecedentCount: configData.min_precedent_count,
          maxAutoApprovalAmount: configData.max_auto_approval_amount,
          enabled: configData.enabled,
        } : null;

        autoApprovalResult = evaluateAutoApproval(
          config,
          policyEvaluation,
          precedentsReferenced,
          currentPO?.total || 0
        );

        // If auto-approval is possible, upgrade to direct approval
        if (autoApprovalResult.canAutoApprove) {
          effectiveAction = "approve";
        }
      }

      let newStatus: string;
      let decisionType: DecisionType;
      
      switch (effectiveAction) {
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
      
      if (effectiveAction === "approve") {
        const { data: { user } } = await supabase.auth.getUser();
        updateData.approved_by = user?.id;
        updateData.approved_at = new Date().toISOString();
      }

      const { error } = await supabase
        .from("purchase_orders")
        .update(updateData)
        .eq("id", id);

      if (error) throw error;

      // Capture decision trace with policy evaluation and auto-approval info
      if (orgId && currentPO) {
        await captureDecisionTrace(orgId, {
          decision_type: decisionType,
          source_type: "purchase_order",
          source_id: id,
          approval_status: effectiveAction === "submit_for_approval" ? "pending" : effectiveAction === "approve" ? "approved" : "rejected",
          approval_channel: autoApprovalResult?.canAutoApprove ? "auto" : "human",
          input_snapshot: {
            po_number: currentPO.po_number,
            vendor_name: currentPO.vendors?.name,
            total: currentPO.total,
            previous_status: currentPO.status,
            auto_approval: autoApprovalResult ? {
              attempted: true,
              result: autoApprovalResult.canAutoApprove ? "approved" : "routed",
              confidence: autoApprovalResult.confidence,
              factors: autoApprovalResult.factors,
            } : undefined,
          },
          policy_evaluation: policyEvaluation,
          precedents_referenced: precedentsReferenced,
          commit_writes: [{
            entity: "purchase_order",
            id,
            field: "status",
            before: currentPO.status,
            after: newStatus,
          }],
          rationale_text: autoApprovalResult?.canAutoApprove 
            ? `Auto-approved: ${autoApprovalResult.reason}` 
            : rationale,
          entities: [
            { entity_type: "purchase_order", entity_id: id, entity_label: currentPO.po_number },
            ...(currentPO.vendor_id ? [{ entity_type: "vendor", entity_id: currentPO.vendor_id, entity_label: currentPO.vendors?.name }] : []),
          ],
        });
      }

      return { 
        success: true, 
        autoApproved: autoApprovalResult?.canAutoApprove,
        autoApprovalResult 
      };
    },
    onSuccess: (result, { action }) => {
      queryClient.invalidateQueries({ queryKey: ["purchase_orders"] });
      queryClient.invalidateQueries({ queryKey: ["decision-traces"] });
      
      if (result.autoApproved) {
        toast({ 
          title: "Auto-Approved", 
          description: `Purchase order auto-approved (${result.autoApprovalResult?.confidence}% confidence)` 
        });
      } else {
        const messages = {
          submit_for_approval: "Purchase order submitted for approval",
          approve: "Purchase order approved",
          reject: "Purchase order rejected",
        };
        toast({ title: "Success", description: messages[action] });
      }
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

      // Capture decision trace with policy evaluation
      const orgId = await getOrgId();
      if (orgId && currentRun) {
        // Evaluate policies
        const policyEvaluation = evaluatePaymentRunPolicy(
          currentRun.total_amount || 0,
          currentRun.payment_method
        );

        // Find precedents
        const precedentsReferenced = await findPrecedents(
          orgId,
          decisionType,
          "payment_run"
        );

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
          policy_evaluation: policyEvaluation,
          precedents_referenced: precedentsReferenced,
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

      // Capture decision trace with policy evaluation
      const orgId = await getOrgId();
      if (orgId && currentEntry) {
        // Evaluate policies
        const policyEvaluation = evaluateJournalEntryPolicy(
          action,
          currentEntry.memo
        );

        // Find precedents
        const precedentsReferenced = await findPrecedents(
          orgId,
          decisionType,
          "journal_entry"
        );

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
          policy_evaluation: policyEvaluation,
          precedents_referenced: precedentsReferenced,
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
