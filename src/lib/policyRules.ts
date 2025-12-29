// Policy Rules Engine for Decision Ledger
// Captures structured policy evaluations with pass/fail results

export interface PolicyRule {
  rule_id: string;
  rule_name: string;
  threshold?: number | string;
  actual?: number | string;
  result: "pass" | "fail" | "warning" | "skip";
  message?: string;
}

export interface PolicyEvaluation {
  rules_checked: PolicyRule[];
  overall_result: "pass" | "fail" | "warning";
  exception_route?: {
    required_approver_role?: string;
    reason_codes_allowed?: string[];
    escalation_level?: number;
  };
  precedents_referenced?: Array<{
    decision_id: string;
    similarity: number;
    note?: string;
  }>;
}

// Purchase Order Policy Rules
export const evaluatePurchaseOrderPolicy = (
  total: number,
  vendorName?: string,
  previousStatus?: string
): PolicyEvaluation => {
  const rules: PolicyRule[] = [];
  let overallResult: "pass" | "fail" | "warning" = "pass";

  // Rule 1: Amount threshold check
  const amountThreshold = 10000;
  if (total > amountThreshold) {
    rules.push({
      rule_id: "po_amount_limit",
      rule_name: "PO Amount Limit",
      threshold: amountThreshold,
      actual: total,
      result: "warning",
      message: `PO exceeds $${amountThreshold.toLocaleString()} threshold, requires approval`,
    });
    overallResult = "warning";
  } else {
    rules.push({
      rule_id: "po_amount_limit",
      rule_name: "PO Amount Limit",
      threshold: amountThreshold,
      actual: total,
      result: "pass",
    });
  }

  // Rule 2: High-value threshold
  const highValueThreshold = 50000;
  if (total > highValueThreshold) {
    rules.push({
      rule_id: "po_high_value",
      rule_name: "High Value PO",
      threshold: highValueThreshold,
      actual: total,
      result: "fail",
      message: `PO exceeds $${highValueThreshold.toLocaleString()}, requires executive approval`,
    });
    overallResult = "fail";
  } else {
    rules.push({
      rule_id: "po_high_value",
      rule_name: "High Value PO",
      threshold: highValueThreshold,
      actual: total,
      result: "pass",
    });
  }

  // Rule 3: Draft to approval workflow
  if (previousStatus === "draft") {
    rules.push({
      rule_id: "po_workflow_sequence",
      rule_name: "Workflow Sequence",
      threshold: "draft → pending_approval",
      actual: previousStatus,
      result: "pass",
    });
  }

  return {
    rules_checked: rules,
    overall_result: overallResult,
    exception_route: overallResult !== "pass" ? {
      required_approver_role: total > highValueThreshold ? "Finance_VP" : "Purchasing_Manager",
      reason_codes_allowed: ["budget_approved", "urgent_need", "sole_source"],
      escalation_level: total > highValueThreshold ? 2 : 1,
    } : undefined,
  };
};

// Payment Run Policy Rules
export const evaluatePaymentRunPolicy = (
  totalAmount: number,
  paymentMethod?: string
): PolicyEvaluation => {
  const rules: PolicyRule[] = [];
  let overallResult: "pass" | "fail" | "warning" = "pass";

  // Rule 1: Payment amount threshold
  const paymentThreshold = 25000;
  if (totalAmount > paymentThreshold) {
    rules.push({
      rule_id: "payment_amount_limit",
      rule_name: "Payment Amount Limit",
      threshold: paymentThreshold,
      actual: totalAmount,
      result: "warning",
      message: `Payment run exceeds $${paymentThreshold.toLocaleString()}`,
    });
    overallResult = "warning";
  } else {
    rules.push({
      rule_id: "payment_amount_limit",
      rule_name: "Payment Amount Limit",
      threshold: paymentThreshold,
      actual: totalAmount,
      result: "pass",
    });
  }

  // Rule 2: Wire transfer limit
  if (paymentMethod === "wire" && totalAmount > 100000) {
    rules.push({
      rule_id: "wire_transfer_limit",
      rule_name: "Wire Transfer Limit",
      threshold: 100000,
      actual: totalAmount,
      result: "fail",
      message: "Wire transfers over $100K require dual approval",
    });
    overallResult = "fail";
  } else if (paymentMethod === "wire") {
    rules.push({
      rule_id: "wire_transfer_limit",
      rule_name: "Wire Transfer Limit",
      threshold: 100000,
      actual: totalAmount,
      result: "pass",
    });
  }

  return {
    rules_checked: rules,
    overall_result: overallResult,
    exception_route: overallResult !== "pass" ? {
      required_approver_role: "Treasury_Manager",
      reason_codes_allowed: ["time_sensitive", "vendor_requirement"],
      escalation_level: 1,
    } : undefined,
  };
};

// Requisition Policy Rules
export const evaluateRequisitionPolicy = (
  estimatedTotal: number,
  priority?: string,
  department?: string
): PolicyEvaluation => {
  const rules: PolicyRule[] = [];
  let overallResult: "pass" | "fail" | "warning" = "pass";

  // Rule 1: Requisition amount threshold
  const reqThreshold = 5000;
  if (estimatedTotal > reqThreshold) {
    rules.push({
      rule_id: "req_amount_limit",
      rule_name: "Requisition Amount Limit",
      threshold: reqThreshold,
      actual: estimatedTotal,
      result: "warning",
      message: `Requisition exceeds $${reqThreshold.toLocaleString()} auto-approval limit`,
    });
    overallResult = "warning";
  } else {
    rules.push({
      rule_id: "req_amount_limit",
      rule_name: "Requisition Amount Limit",
      threshold: reqThreshold,
      actual: estimatedTotal,
      result: "pass",
    });
  }

  // Rule 2: Urgent priority check
  if (priority === "urgent") {
    rules.push({
      rule_id: "urgent_priority",
      rule_name: "Urgent Priority Flag",
      threshold: "normal",
      actual: priority,
      result: "warning",
      message: "Urgent requests require expedited review",
    });
    if (overallResult === "pass") overallResult = "warning";
  }

  // Rule 3: Budget availability (mock)
  rules.push({
    rule_id: "budget_availability",
    rule_name: "Budget Availability",
    threshold: "available",
    actual: "available",
    result: "pass",
    message: "Funds available in department budget",
  });

  return {
    rules_checked: rules,
    overall_result: overallResult,
    exception_route: overallResult !== "pass" ? {
      required_approver_role: "Department_Manager",
      reason_codes_allowed: ["budget_approved", "project_critical", "scheduled_maintenance"],
      escalation_level: 1,
    } : undefined,
  };
};

// Journal Entry Policy Rules
export const evaluateJournalEntryPolicy = (
  action: "post" | "reverse",
  memo?: string
): PolicyEvaluation => {
  const rules: PolicyRule[] = [];
  let overallResult: "pass" | "fail" | "warning" = "pass";

  // Rule 1: Entry has memo
  if (!memo || memo.trim().length < 5) {
    rules.push({
      rule_id: "memo_required",
      rule_name: "Memo Required",
      threshold: "min 5 chars",
      actual: memo?.length || 0,
      result: "warning",
      message: "Journal entries should have descriptive memos",
    });
    overallResult = "warning";
  } else {
    rules.push({
      rule_id: "memo_required",
      rule_name: "Memo Required",
      threshold: "min 5 chars",
      actual: memo.length,
      result: "pass",
    });
  }

  // Rule 2: Reversal requires explanation
  if (action === "reverse") {
    rules.push({
      rule_id: "reversal_audit",
      rule_name: "Reversal Audit Trail",
      threshold: "required",
      actual: "logged",
      result: "pass",
      message: "Reversal will be logged in audit trail",
    });
  }

  return {
    rules_checked: rules,
    overall_result: overallResult,
  };
};
