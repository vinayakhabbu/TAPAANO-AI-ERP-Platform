import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Auto-approval configuration
const AUTO_APPROVAL_CONFIGS: Record<string, {
  minPrecedentSimilarity: number;
  minPrecedentCount: number;
  maxAutoApprovalAmount: number;
  enabled: boolean;
}> = {
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
};

interface AutoApprovalCandidate {
  id: string;
  type: "purchase_order" | "payment_run" | "purchase_requisition";
  identifier: string;
  amount: number;
  confidence: number;
  factors: {
    policyPassed: boolean;
    precedentStrength: number;
    amountWithinLimit: boolean;
    riskLevel: string;
  };
  canAutoApprove: boolean;
  reason: string;
}

interface ProcessingResult {
  processed: number;
  autoApproved: number;
  routed: number;
  errors: number;
  candidates: AutoApprovalCandidate[];
}

// ============================================================================
// AUTH HELPER - Validates user and extracts verified org_id
// ============================================================================

async function validateAuthAndGetOrgId(req: Request): Promise<{ user: any; org_id: string; error?: string }> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, org_id: '', error: 'Missing or invalid authorization header' };
  }

  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  // Verify user token
  const token = authHeader.replace('Bearer ', '');
  const { data, error: authError } = await supabaseClient.auth.getUser(token);
  
  if (authError || !data?.user) {
    return { user: null, org_id: '', error: 'Invalid or expired token' };
  }

  // Get user's org_id from their profile (don't trust client input!)
  const { data: profile, error: profileError } = await supabaseClient
    .from('profiles')
    .select('org_id')
    .eq('id', data.user.id)
    .single();

  if (profileError || !profile?.org_id) {
    return { user: data.user, org_id: '', error: 'User profile not found or not associated with an organization' };
  }

  return { user: data.user, org_id: profile.org_id };
}

// Find precedents for a decision type
async function findPrecedents(
  supabase: any,
  orgId: string,
  decisionType: string,
  sourceType: string
): Promise<{ decision_id: string; similarity: number }[]> {
  const { data: precedents } = await supabase
    .from("decision_traces")
    .select("id, input_snapshot")
    .eq("org_id", orgId)
    .eq("decision_type", decisionType)
    .eq("source_type", sourceType)
    .in("approval_status", ["approved"])
    .order("created_at", { ascending: false })
    .limit(5);

  if (!precedents || precedents.length === 0) return [];

  return precedents.map((p: any, idx: number) => ({
    decision_id: p.id,
    similarity: Math.round((0.9 - idx * 0.1) * 100) / 100,
  }));
}

// Evaluate if item can be auto-approved
function evaluateAutoApproval(
  decisionType: string,
  amount: number,
  precedents: { decision_id: string; similarity: number }[],
  policyPassed: boolean
): AutoApprovalCandidate["factors"] & { canAutoApprove: boolean; confidence: number; reason: string } {
  const config = AUTO_APPROVAL_CONFIGS[decisionType];
  if (!config || !config.enabled) {
    return {
      policyPassed: false,
      precedentStrength: 0,
      amountWithinLimit: false,
      riskLevel: "high",
      canAutoApprove: false,
      confidence: 0,
      reason: "Auto-approval disabled for this type",
    };
  }

  const strongPrecedents = precedents.filter(p => p.similarity >= config.minPrecedentSimilarity);
  const precedentStrength = strongPrecedents.length >= config.minPrecedentCount
    ? 50 + (strongPrecedents.reduce((sum, p) => sum + p.similarity, 0) / strongPrecedents.length) * 50
    : (strongPrecedents.length / config.minPrecedentCount) * 50;

  const amountWithinLimit = amount <= config.maxAutoApprovalAmount;
  const riskLevel = !policyPassed ? "high" : !amountWithinLimit ? "medium" : "low";

  const policyScore = policyPassed ? 100 : 0;
  const amountScore = amountWithinLimit ? 100 : (config.maxAutoApprovalAmount / amount) * 100;
  const riskScore = riskLevel === "low" ? 100 : riskLevel === "medium" ? 50 : 0;

  const confidence = Math.round(
    (policyScore * 0.35) +
    (precedentStrength * 0.30) +
    (amountScore * 0.20) +
    (riskScore * 0.15)
  );

  const canAutoApprove = 
    policyPassed && 
    amountWithinLimit && 
    precedentStrength >= 70 && 
    riskLevel === "low" &&
    confidence >= 75;

  let reason: string;
  if (canAutoApprove) {
    reason = `Auto-approved: ${confidence}% confidence, ${strongPrecedents.length} strong precedents`;
  } else {
    const issues: string[] = [];
    if (!policyPassed) issues.push("policy failed");
    if (!amountWithinLimit) issues.push(`exceeds $${config.maxAutoApprovalAmount} limit`);
    if (precedentStrength < 70) issues.push("insufficient precedents");
    reason = `Routed: ${issues.join(", ")}`;
  }

  return {
    policyPassed,
    precedentStrength: Math.round(precedentStrength),
    amountWithinLimit,
    riskLevel,
    canAutoApprove,
    confidence,
    reason,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication and get verified org_id
    const { user, org_id, error: authError } = await validateAuthAndGetOrgId(req);
    
    if (authError || !org_id) {
      return new Response(
        JSON.stringify({ error: authError || 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { mode = "preview", types = ["purchase_order", "payment_run", "purchase_requisition"] } = await req.json();

    console.log(`Autonomous approver request - org_id: ${org_id}, user: ${user.id}, mode: ${mode}`);

    const result: ProcessingResult = {
      processed: 0,
      autoApproved: 0,
      routed: 0,
      errors: 0,
      candidates: [],
    };

    // Process Purchase Orders
    if (types.includes("purchase_order")) {
      const { data: pendingPOs } = await supabase
        .from("purchase_orders")
        .select("id, po_number, total, status, vendor_id, vendors(name)")
        .eq("org_id", org_id)
        .eq("status", "pending_approval");

      for (const po of pendingPOs || []) {
        result.processed++;
        const precedents = await findPrecedents(supabase, org_id, "po_approval", "purchase_order");
        const policyPassed = (po.total || 0) <= 10000; // Simple policy check
        const evaluation = evaluateAutoApproval("po_approval", po.total || 0, precedents, policyPassed);

        const candidate: AutoApprovalCandidate = {
          id: po.id,
          type: "purchase_order",
          identifier: po.po_number,
          amount: po.total || 0,
          confidence: evaluation.confidence,
          factors: {
            policyPassed: evaluation.policyPassed,
            precedentStrength: evaluation.precedentStrength,
            amountWithinLimit: evaluation.amountWithinLimit,
            riskLevel: evaluation.riskLevel,
          },
          canAutoApprove: evaluation.canAutoApprove,
          reason: evaluation.reason,
        };
        result.candidates.push(candidate);

        // Execute approval if in execute mode
        if (mode === "execute" && evaluation.canAutoApprove) {
          const { error } = await supabase
            .from("purchase_orders")
            .update({
              status: "approved",
              approved_at: new Date().toISOString(),
            })
            .eq("id", po.id);

          if (error) {
            result.errors++;
            console.error("Failed to auto-approve PO:", error);
          } else {
            result.autoApproved++;
            
            // Capture decision trace with precedents referenced
            await supabase.from("decision_traces").insert({
              org_id,
              decision_type: "po_approval",
              source_type: "purchase_order",
              source_id: po.id,
              input_snapshot: {
                po_number: po.po_number,
                total: po.total,
                vendor_name: (po.vendors as any)?.name,
                auto_approval: {
                  confidence: evaluation.confidence,
                  factors: evaluation,
                },
              },
              precedents_referenced: precedents.map(p => ({
                decision_id: p.decision_id,
                similarity: p.similarity,
                note: `Precedent with ${Math.round(p.similarity * 100)}% similarity`
              })),
              approval_status: "approved",
              approval_channel: "auto",
              rationale_text: `Autonomous auto-approval: ${evaluation.reason}`,
            });
          }
        } else if (!evaluation.canAutoApprove) {
          result.routed++;
        }
      }
    }

    // Process Payment Runs
    if (types.includes("payment_run")) {
      const { data: pendingPayments } = await supabase
        .from("payment_runs")
        .select("id, run_number, total_amount, status, payment_method")
        .eq("org_id", org_id)
        .eq("status", "pending_approval");

      for (const payment of pendingPayments || []) {
        result.processed++;
        const precedents = await findPrecedents(supabase, org_id, "payment_approval", "payment_run");
        const policyPassed = (payment.total_amount || 0) <= 25000;
        const evaluation = evaluateAutoApproval("payment_approval", payment.total_amount || 0, precedents, policyPassed);

        const candidate: AutoApprovalCandidate = {
          id: payment.id,
          type: "payment_run",
          identifier: payment.run_number,
          amount: payment.total_amount || 0,
          confidence: evaluation.confidence,
          factors: {
            policyPassed: evaluation.policyPassed,
            precedentStrength: evaluation.precedentStrength,
            amountWithinLimit: evaluation.amountWithinLimit,
            riskLevel: evaluation.riskLevel,
          },
          canAutoApprove: evaluation.canAutoApprove,
          reason: evaluation.reason,
        };
        result.candidates.push(candidate);

        if (mode === "execute" && evaluation.canAutoApprove) {
          const { error } = await supabase
            .from("payment_runs")
            .update({
              status: "approved",
              approved_at: new Date().toISOString(),
            })
            .eq("id", payment.id);

          if (error) {
            result.errors++;
          } else {
            result.autoApproved++;
            await supabase.from("decision_traces").insert({
              org_id,
              decision_type: "payment_approval",
              source_type: "payment_run",
              source_id: payment.id,
              input_snapshot: {
                run_number: payment.run_number,
                total_amount: payment.total_amount,
                payment_method: payment.payment_method,
                auto_approval: { confidence: evaluation.confidence, factors: evaluation },
              },
              precedents_referenced: precedents.map(p => ({
                decision_id: p.decision_id,
                similarity: p.similarity,
                note: `Precedent with ${Math.round(p.similarity * 100)}% similarity`
              })),
              approval_status: "approved",
              approval_channel: "auto",
              rationale_text: `Autonomous auto-approval: ${evaluation.reason}`,
            });
          }
        } else if (!evaluation.canAutoApprove) {
          result.routed++;
        }
      }
    }

    // Process Purchase Requisitions
    if (types.includes("purchase_requisition")) {
      const { data: pendingReqs } = await supabase
        .from("purchase_requisitions")
        .select("id, requisition_number, priority, department, status")
        .eq("org_id", org_id)
        .eq("status", "pending_approval");

      for (const reqItem of pendingReqs || []) {
        // Get lines to calculate total
        const { data: lines } = await supabase
          .from("purchase_requisition_lines")
          .select("quantity, estimated_unit_cost")
          .eq("requisition_id", reqItem.id);

        const estimatedTotal = (lines || []).reduce(
          (sum: number, line: any) => sum + (line.quantity * line.estimated_unit_cost),
          0
        );

        result.processed++;
        const precedents = await findPrecedents(supabase, org_id, "requisition_approval", "purchase_requisition");
        const policyPassed = estimatedTotal <= 5000 && reqItem.priority !== "urgent";
        const evaluation = evaluateAutoApproval("requisition_approval", estimatedTotal, precedents, policyPassed);

        const candidate: AutoApprovalCandidate = {
          id: reqItem.id,
          type: "purchase_requisition",
          identifier: reqItem.requisition_number,
          amount: estimatedTotal,
          confidence: evaluation.confidence,
          factors: {
            policyPassed: evaluation.policyPassed,
            precedentStrength: evaluation.precedentStrength,
            amountWithinLimit: evaluation.amountWithinLimit,
            riskLevel: evaluation.riskLevel,
          },
          canAutoApprove: evaluation.canAutoApprove,
          reason: evaluation.reason,
        };
        result.candidates.push(candidate);

        if (mode === "execute" && evaluation.canAutoApprove) {
          const { error } = await supabase
            .from("purchase_requisitions")
            .update({
              status: "approved",
              approved_at: new Date().toISOString(),
            })
            .eq("id", reqItem.id);

          if (error) {
            result.errors++;
          } else {
            result.autoApproved++;
            await supabase.from("decision_traces").insert({
              org_id,
              decision_type: "requisition_approval",
              source_type: "purchase_requisition",
              source_id: reqItem.id,
              input_snapshot: {
                requisition_number: reqItem.requisition_number,
                estimated_total: estimatedTotal,
                priority: reqItem.priority,
                department: reqItem.department,
                auto_approval: { confidence: evaluation.confidence, factors: evaluation },
              },
              precedents_referenced: precedents.map(p => ({
                decision_id: p.decision_id,
                similarity: p.similarity,
                note: `Precedent with ${Math.round(p.similarity * 100)}% similarity`
              })),
              approval_status: "approved",
              approval_channel: "auto",
              rationale_text: `Autonomous auto-approval: ${evaluation.reason}`,
            });
          }
        } else if (!evaluation.canAutoApprove) {
          result.routed++;
        }
      }
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Autonomous approver error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});