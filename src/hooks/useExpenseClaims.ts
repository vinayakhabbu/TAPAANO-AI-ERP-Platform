import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { captureDecisionTrace } from "./useDecisionLedger";
export interface ExpenseClaim {
  id: string;
  org_id: string;
  employee_id: string;
  claim_number: string;
  claim_date: string;
  description: string;
  category: "travel" | "meals" | "supplies" | "equipment" | "training" | "other";
  amount: number;
  currency: string;
  receipt_url: string | null;
  status: "draft" | "submitted" | "approved" | "rejected" | "paid";
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
  employee?: { first_name: string; last_name: string };
}

export const EXPENSE_CATEGORIES = [
  { value: "travel", label: "Travel" },
  { value: "meals", label: "Meals" },
  { value: "supplies", label: "Supplies" },
  { value: "equipment", label: "Equipment" },
  { value: "training", label: "Training" },
  { value: "other", label: "Other" },
];

export const useExpenseClaims = (employeeId?: string) => {
  return useQuery({
    queryKey: ["expense-claims", employeeId],
    queryFn: async () => {
      let query = supabase
        .from("expense_claims")
        .select("*, employee:employees!expense_claims_employee_id_fkey(first_name, last_name)")
        .order("claim_date", { ascending: false });
      
      if (employeeId) {
        query = query.eq("employee_id", employeeId);
      }
      
      const { data, error } = await query;
      if (error) throw error;
      return data as ExpenseClaim[];
    },
  });
};

export const useCreateExpenseClaim = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (claim: {
      employee_id: string;
      description: string;
      category: string;
      amount: number;
      currency?: string;
      receipt_url?: string;
      notes?: string;
    }) => {
      const { data: profile } = await supabase.from("profiles").select("org_id").single();
      if (!profile?.org_id) throw new Error("No organization found");

      const claimNumber = `EXP-${Date.now().toString().slice(-6)}`;

      const { data, error } = await supabase
        .from("expense_claims")
        .insert({
          org_id: profile.org_id,
          claim_number: claimNumber,
          status: "submitted",
          ...claim,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-claims"] });
      toast.success("Expense claim submitted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useApproveExpenseClaim = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ claimId, approverId }: { claimId: string; approverId: string }) => {
      // Get claim details first
      const { data: claim } = await supabase
        .from("expense_claims")
        .select("*, employee:employees!expense_claims_employee_id_fkey(first_name, last_name, org_id)")
        .eq("id", claimId)
        .single();

      const { data, error } = await supabase
        .from("expense_claims")
        .update({
          status: "approved",
          approved_by: approverId,
          approved_at: new Date().toISOString(),
        })
        .eq("id", claimId)
        .select()
        .single();
      if (error) throw error;

      // Capture decision trace
      if (claim?.employee?.org_id) {
        await captureDecisionTrace(claim.employee.org_id, {
          decision_type: "expense_claim_approval",
          source_type: "expense_claim",
          source_id: claimId,
          approval_status: "approved",
          approval_channel: "human",
          input_snapshot: {
            claim_number: claim.claim_number,
            employee_name: `${claim.employee.first_name} ${claim.employee.last_name}`,
            amount: claim.amount,
            currency: claim.currency,
            category: claim.category,
            description: claim.description,
          },
          rationale_text: "Expense claim approved by manager",
          commit_writes: [{
            entity: "expense_claims",
            id: claimId,
            field: "status",
            before: claim.status,
            after: "approved",
          }],
          entities: [{
            entity_type: "employee",
            entity_id: claim.employee_id,
            entity_label: `${claim.employee.first_name} ${claim.employee.last_name}`,
          }],
        });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-claims"] });
      toast.success("Expense claim approved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useRejectExpenseClaim = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ claimId, reason }: { claimId: string; reason: string }) => {
      // Get claim details first
      const { data: claim } = await supabase
        .from("expense_claims")
        .select("*, employee:employees!expense_claims_employee_id_fkey(first_name, last_name, org_id)")
        .eq("id", claimId)
        .single();

      const { data, error } = await supabase
        .from("expense_claims")
        .update({
          status: "rejected",
          rejection_reason: reason,
        })
        .eq("id", claimId)
        .select()
        .single();
      if (error) throw error;

      // Capture decision trace
      if (claim?.employee?.org_id) {
        await captureDecisionTrace(claim.employee.org_id, {
          decision_type: "expense_claim_rejection",
          source_type: "expense_claim",
          source_id: claimId,
          approval_status: "rejected",
          approval_channel: "human",
          input_snapshot: {
            claim_number: claim.claim_number,
            employee_name: `${claim.employee.first_name} ${claim.employee.last_name}`,
            amount: claim.amount,
            currency: claim.currency,
            category: claim.category,
            description: claim.description,
          },
          rationale_text: `Expense claim rejected: ${reason}`,
          reason_codes: ["rejected_by_manager"],
          commit_writes: [{
            entity: "expense_claims",
            id: claimId,
            field: "status",
            before: claim.status,
            after: "rejected",
          }],
          entities: [{
            entity_type: "employee",
            entity_id: claim.employee_id,
            entity_label: `${claim.employee.first_name} ${claim.employee.last_name}`,
          }],
        });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-claims"] });
      toast.success("Expense claim rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useMarkExpenseAsPaid = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (claimId: string) => {
      // Get claim details first
      const { data: claim } = await supabase
        .from("expense_claims")
        .select("*, employee:employees!expense_claims_employee_id_fkey(first_name, last_name, org_id)")
        .eq("id", claimId)
        .single();

      const { data, error } = await supabase
        .from("expense_claims")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
        })
        .eq("id", claimId)
        .select()
        .single();
      if (error) throw error;

      // Capture decision trace
      if (claim?.employee?.org_id) {
        await captureDecisionTrace(claim.employee.org_id, {
          decision_type: "expense_claim_paid",
          source_type: "expense_claim",
          source_id: claimId,
          approval_status: "approved",
          approval_channel: "human",
          input_snapshot: {
            claim_number: claim.claim_number,
            employee_name: `${claim.employee.first_name} ${claim.employee.last_name}`,
            amount: claim.amount,
            currency: claim.currency,
            category: claim.category,
          },
          rationale_text: "Expense claim payment processed",
          commit_writes: [{
            entity: "expense_claims",
            id: claimId,
            field: "status",
            before: claim.status,
            after: "paid",
          }],
          entities: [{
            entity_type: "employee",
            entity_id: claim.employee_id,
            entity_label: `${claim.employee.first_name} ${claim.employee.last_name}`,
          }],
        });
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["expense-claims"] });
      toast.success("Expense marked as paid");
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
