// Auto-Approval Engine for Phase 2 Agentic ERP
// Determines if a decision can be auto-approved based on policy + precedent confidence

import type { PolicyEvaluation } from "./policyRules";
import type { PrecedentReference } from "@/hooks/useDecisionLedger";

export interface AutoApprovalConfig {
  // Minimum precedent similarity to consider (0-1)
  minPrecedentSimilarity: number;
  // Minimum number of matching precedents required
  minPrecedentCount: number;
  // Maximum amount for auto-approval (varies by type)
  maxAutoApprovalAmount: number;
  // Whether to allow auto-approval at all
  enabled: boolean;
}

export interface AutoApprovalResult {
  canAutoApprove: boolean;
  confidence: number; // 0-100
  reason: string;
  factors: {
    policyPassed: boolean;
    precedentStrength: number;
    amountWithinLimit: boolean;
    riskLevel: "low" | "medium" | "high";
  };
  recommendedAction: "auto_approve" | "route_for_approval" | "escalate";
  approvalChannel: "auto" | "human" | "escalated";
}

// Default configs by decision type
export const AUTO_APPROVAL_CONFIGS: Record<string, AutoApprovalConfig> = {
  po_approval: {
    minPrecedentSimilarity: 0.75,
    minPrecedentCount: 2,
    maxAutoApprovalAmount: 5000,
    enabled: true,
  },
  payment_approval: {
    minPrecedentSimilarity: 0.80,
    minPrecedentCount: 3,
    maxAutoApprovalAmount: 10000,
    enabled: true,
  },
  requisition_approval: {
    minPrecedentSimilarity: 0.70,
    minPrecedentCount: 2,
    maxAutoApprovalAmount: 3000,
    enabled: true,
  },
  journal_post: {
    minPrecedentSimilarity: 0.85,
    minPrecedentCount: 3,
    maxAutoApprovalAmount: Infinity, // Amount not relevant for JEs
    enabled: true,
  },
};

/**
 * Calculate precedent strength score (0-100)
 */
const calculatePrecedentStrength = (
  precedents: PrecedentReference[],
  config: AutoApprovalConfig
): number => {
  if (!precedents || precedents.length === 0) return 0;
  
  // Filter to high-similarity precedents
  const strongPrecedents = precedents.filter(
    p => p.similarity >= config.minPrecedentSimilarity
  );
  
  if (strongPrecedents.length < config.minPrecedentCount) {
    return (strongPrecedents.length / config.minPrecedentCount) * 50;
  }
  
  // Calculate weighted average similarity
  const avgSimilarity = strongPrecedents.reduce((sum, p) => sum + p.similarity, 0) / strongPrecedents.length;
  
  // Score: base 50 for meeting count threshold + up to 50 for similarity
  return 50 + (avgSimilarity * 50);
};

/**
 * Determine risk level based on policy and amount
 */
const determineRiskLevel = (
  policyResult: "pass" | "fail" | "warning",
  amount: number,
  maxAmount: number
): "low" | "medium" | "high" => {
  if (policyResult === "fail") return "high";
  if (policyResult === "warning") return "medium";
  if (amount > maxAmount * 0.8) return "medium";
  return "low";
};

/**
 * Main auto-approval evaluation function
 */
export const evaluateAutoApproval = (
  decisionType: string,
  policyEvaluation: PolicyEvaluation,
  precedents: PrecedentReference[],
  amount: number
): AutoApprovalResult => {
  const config = AUTO_APPROVAL_CONFIGS[decisionType] || {
    minPrecedentSimilarity: 0.80,
    minPrecedentCount: 3,
    maxAutoApprovalAmount: 0,
    enabled: false,
  };

  // Check if auto-approval is enabled
  if (!config.enabled) {
    return {
      canAutoApprove: false,
      confidence: 0,
      reason: "Auto-approval disabled for this decision type",
      factors: {
        policyPassed: policyEvaluation.overall_result === "pass",
        precedentStrength: 0,
        amountWithinLimit: false,
        riskLevel: "high",
      },
      recommendedAction: "route_for_approval",
      approvalChannel: "human",
    };
  }

  // Factor 1: Policy evaluation
  const policyPassed = policyEvaluation.overall_result === "pass";
  const policyScore = policyPassed ? 100 : policyEvaluation.overall_result === "warning" ? 50 : 0;

  // Factor 2: Precedent strength
  const precedentStrength = calculatePrecedentStrength(precedents, config);

  // Factor 3: Amount within auto-approval limit
  const amountWithinLimit = amount <= config.maxAutoApprovalAmount;
  const amountScore = amountWithinLimit ? 100 : (config.maxAutoApprovalAmount / amount) * 100;

  // Factor 4: Risk level
  const riskLevel = determineRiskLevel(
    policyEvaluation.overall_result,
    amount,
    config.maxAutoApprovalAmount
  );
  const riskScore = riskLevel === "low" ? 100 : riskLevel === "medium" ? 50 : 0;

  // Calculate overall confidence (weighted average)
  const confidence = Math.round(
    (policyScore * 0.35) + 
    (precedentStrength * 0.30) + 
    (amountScore * 0.20) + 
    (riskScore * 0.15)
  );

  // Determine if auto-approval is possible
  const canAutoApprove = 
    policyPassed && 
    amountWithinLimit && 
    precedentStrength >= 70 && 
    riskLevel === "low" &&
    confidence >= 75;

  // Determine recommended action and reason
  let recommendedAction: "auto_approve" | "route_for_approval" | "escalate";
  let approvalChannel: "auto" | "human" | "escalated";
  let reason: string;

  if (canAutoApprove) {
    recommendedAction = "auto_approve";
    approvalChannel = "auto";
    reason = `Auto-approved: Policy passed, ${precedents.length} strong precedents, amount within $${config.maxAutoApprovalAmount.toLocaleString()} limit`;
  } else if (riskLevel === "high" || policyEvaluation.overall_result === "fail") {
    recommendedAction = "escalate";
    approvalChannel = "escalated";
    reason = buildRejectionReason(policyPassed, precedentStrength, amountWithinLimit, config);
  } else {
    recommendedAction = "route_for_approval";
    approvalChannel = "human";
    reason = buildRoutingReason(policyPassed, precedentStrength, amountWithinLimit, config);
  }

  return {
    canAutoApprove,
    confidence,
    reason,
    factors: {
      policyPassed,
      precedentStrength: Math.round(precedentStrength),
      amountWithinLimit,
      riskLevel,
    },
    recommendedAction,
    approvalChannel,
  };
};

const buildRejectionReason = (
  policyPassed: boolean,
  precedentStrength: number,
  amountWithinLimit: boolean,
  config: AutoApprovalConfig
): string => {
  const issues: string[] = [];
  if (!policyPassed) issues.push("policy check failed");
  if (precedentStrength < 50) issues.push("insufficient precedent history");
  if (!amountWithinLimit) issues.push(`exceeds $${config.maxAutoApprovalAmount.toLocaleString()} auto-approval limit`);
  return `Escalated: ${issues.join(", ")}`;
};

const buildRoutingReason = (
  policyPassed: boolean,
  precedentStrength: number,
  amountWithinLimit: boolean,
  config: AutoApprovalConfig
): string => {
  const reasons: string[] = [];
  if (!policyPassed) reasons.push("policy warning");
  if (precedentStrength < 70) reasons.push(`precedent strength ${Math.round(precedentStrength)}% below 70% threshold`);
  if (!amountWithinLimit) reasons.push(`amount exceeds $${config.maxAutoApprovalAmount.toLocaleString()} limit`);
  return `Routed for human approval: ${reasons.join(", ")}`;
};

/**
 * Get auto-approval configuration for a decision type
 */
export const getAutoApprovalConfig = (decisionType: string): AutoApprovalConfig => {
  return AUTO_APPROVAL_CONFIGS[decisionType] || {
    minPrecedentSimilarity: 0.80,
    minPrecedentCount: 3,
    maxAutoApprovalAmount: 0,
    enabled: false,
  };
};
