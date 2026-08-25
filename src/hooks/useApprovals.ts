import { useMutation } from "@tanstack/react-query";

type ApprovalAction = "approve" | "reject" | "submit_for_approval";

interface ApprovalResult {
  success: boolean;
}

const unavailable = (workflow: string): never => {
  throw new Error(`${workflow} is unavailable until an atomic, auditable workflow exists.`);
};

export const usePurchaseOrderApproval = () => useMutation({
  mutationFn: async (_input: {
    id: string;
    action: ApprovalAction;
    rationale?: string;
    tryAutoApprove?: boolean;
  }): Promise<ApprovalResult> => unavailable("Purchase-order approval"),
});

export const usePaymentRunApproval = () => useMutation({
  mutationFn: async (_input: {
    id: string;
    action: ApprovalAction;
    rationale?: string;
  }): Promise<ApprovalResult> => unavailable("Payment-run approval"),
});

export const useBillStatusUpdate = () => useMutation({
  mutationFn: async (_input: {
    id: string;
    status: "draft" | "pending" | "paid" | "overdue" | "cancelled";
    rationale?: string;
  }): Promise<ApprovalResult> => unavailable("Bill status changes"),
});

export const useProcessPaymentRun = () => useMutation({
  mutationFn: async (_input: { id: string; rationale?: string }): Promise<ApprovalResult> =>
    unavailable("Payment execution"),
});
