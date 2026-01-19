import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Anomaly {
  id: string;
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  title: string;
  description: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  detected_value: number | string;
  expected_range?: string;
  detected_at: string;
  metadata?: Record<string, unknown>;
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Anomaly detection request for org:", org_id, "user:", user.id);

    const anomalies: Anomaly[] = [];
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // 1. Detect unusually large purchase orders (>2 std dev from mean)
    const { data: pos } = await supabase
      .from("purchase_orders")
      .select("id, po_number, total, vendor_id, vendors(name), created_at")
      .eq("org_id", org_id)
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (pos && pos.length > 5) {
      const totals = pos.map((p: any) => p.total);
      const mean = totals.reduce((a: number, b: number) => a + b, 0) / totals.length;
      const stdDev = Math.sqrt(totals.reduce((sq: number, n: number) => sq + Math.pow(n - mean, 2), 0) / totals.length);
      const threshold = mean + 2 * stdDev;

      for (const po of pos) {
        if (po.total > threshold) {
          anomalies.push({
            id: `po-high-value-${po.id}`,
            type: "high_value_transaction",
            severity: po.total > mean + 3 * stdDev ? "critical" : "high",
            title: "Unusually Large Purchase Order",
            description: `PO ${po.po_number} for $${po.total.toLocaleString()} is significantly above average ($${mean.toFixed(0)})`,
            entity_type: "purchase_order",
            entity_id: po.id,
            entity_label: po.po_number,
            detected_value: po.total,
            expected_range: `$0 - $${threshold.toFixed(0)}`,
            detected_at: po.created_at,
            metadata: { vendor: (po as any).vendors?.name, mean, stdDev },
          });
        }
      }
    }

    // 2. Detect rapid-fire approvals (many approvals in short time)
    const { data: recentTraces } = await supabase
      .from("decision_traces")
      .select("*")
      .eq("org_id", org_id)
      .in("decision_type", ["po_approval", "payment_approval", "pr_approval"])
      .eq("approval_status", "approved")
      .gte("created_at", new Date(now.getTime() - 60 * 60 * 1000).toISOString()) // Last hour
      .order("created_at", { ascending: false });

    if (recentTraces && recentTraces.length > 10) {
      // Group by approval_channel
      const byChannel = recentTraces.reduce((acc: Record<string, any[]>, trace) => {
        const channel = trace.approval_channel || "human";
        if (!acc[channel]) acc[channel] = [];
        acc[channel].push(trace);
        return acc;
      }, {});

      for (const [channel, traces] of Object.entries(byChannel)) {
        if (traces.length > 5) {
          anomalies.push({
            id: `rapid-approval-${channel}-${now.getTime()}`,
            type: "rapid_approvals",
            severity: traces.length > 15 ? "high" : "medium",
            title: "Rapid Approval Activity",
            description: `${traces.length} approvals via ${channel} in the last hour. This is unusual volume.`,
            entity_type: "approval_batch",
            entity_id: channel,
            entity_label: `${channel} approvals`,
            detected_value: traces.length,
            expected_range: "1-5 per hour",
            detected_at: now.toISOString(),
            metadata: { channel, traces: traces.slice(0, 5).map((t: any) => t.source_id) },
          });
        }
      }
    }

    // 3. Detect unusual payment patterns (same vendor, multiple payments)
    const { data: paymentRuns } = await supabase
      .from("payment_runs")
      .select("id, run_number, total_amount, payment_date, status")
      .eq("org_id", org_id)
      .eq("status", "completed")
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (paymentRuns && paymentRuns.length > 0) {
      // Check for duplicate amounts on same day
      const byDate = paymentRuns.reduce((acc: Record<string, any[]>, run: any) => {
        const date = run.payment_date?.split("T")[0] || "";
        if (!acc[date]) acc[date] = [];
        acc[date].push(run);
        return acc;
      }, {});

      for (const [date, runs] of Object.entries(byDate)) {
        if (runs.length > 3) {
          anomalies.push({
            id: `multiple-payments-${date}`,
            type: "duplicate_pattern",
            severity: "medium",
            title: "Multiple Payment Runs Same Day",
            description: `${runs.length} payment runs processed on ${date}. Review for potential duplicates.`,
            entity_type: "payment_run_batch",
            entity_id: date,
            entity_label: `Payments on ${date}`,
            detected_value: runs.length,
            expected_range: "1-2 per day",
            detected_at: now.toISOString(),
            metadata: { runs: runs.map((r: any) => ({ id: r.id, amount: r.total_amount })) },
          });
        }
      }
    }

    // 4. Detect auto-approval override patterns (learning from overrides)
    const { data: overrides } = await supabase
      .from("decision_overrides")
      .select("*")
      .eq("org_id", org_id)
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (overrides && overrides.length > 0) {
      // Group by decision type
      const byType = overrides.reduce((acc: Record<string, any[]>, o) => {
        if (!acc[o.decision_type]) acc[o.decision_type] = [];
        acc[o.decision_type].push(o);
        return acc;
      }, {});

      for (const [type, typeOverrides] of Object.entries(byType)) {
        if (typeOverrides.length >= 3) {
          anomalies.push({
            id: `override-pattern-${type}`,
            type: "override_pattern",
            severity: typeOverrides.length > 5 ? "high" : "medium",
            title: "Frequent Auto-Approval Overrides",
            description: `${typeOverrides.length} auto-approval overrides for ${type.replace("_", " ")} in 30 days. Consider adjusting auto-approval thresholds.`,
            entity_type: "decision_type",
            entity_id: type,
            entity_label: type.replace("_", " "),
            detected_value: typeOverrides.length,
            expected_range: "0-2 per month",
            detected_at: now.toISOString(),
            metadata: { overrides: typeOverrides.slice(0, 3) },
          });
        }
      }
    }

    // 5. Detect stalled approvals (pending for too long)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const { data: stalledPOs } = await supabase
      .from("purchase_orders")
      .select("id, po_number, total, vendors(name), created_at")
      .eq("org_id", org_id)
      .eq("status", "pending_approval")
      .lt("created_at", sevenDaysAgo.toISOString());

    for (const po of stalledPOs || []) {
      const daysPending = Math.floor((now.getTime() - new Date(po.created_at).getTime()) / (24 * 60 * 60 * 1000));
      anomalies.push({
        id: `stalled-po-${po.id}`,
        type: "stalled_approval",
        severity: daysPending > 14 ? "high" : "medium",
        title: "Stalled Purchase Order Approval",
        description: `PO ${po.po_number} has been pending approval for ${daysPending} days`,
        entity_type: "purchase_order",
        entity_id: po.id,
        entity_label: po.po_number,
        detected_value: daysPending,
        expected_range: "0-5 days",
        detected_at: now.toISOString(),
        metadata: { vendor: (po as any).vendors?.name, total: po.total },
      });
    }

    // 6. Detect unusual working hours activity
    const { data: afterHoursTraces } = await supabase
      .from("decision_traces")
      .select("*")
      .eq("org_id", org_id)
      .gte("created_at", thirtyDaysAgo.toISOString());

    if (afterHoursTraces) {
      const afterHoursApprovals = afterHoursTraces.filter((t: any) => {
        const hour = new Date(t.created_at).getUTCHours();
        return hour < 6 || hour > 22; // Outside 6 AM - 10 PM UTC
      });

      if (afterHoursApprovals.length > 5) {
        anomalies.push({
          id: `after-hours-activity-${now.getTime()}`,
          type: "unusual_timing",
          severity: "low",
          title: "After-Hours Approval Activity",
          description: `${afterHoursApprovals.length} approvals made outside business hours in the last 30 days`,
          entity_type: "approval_pattern",
          entity_id: "after_hours",
          entity_label: "After-hours approvals",
          detected_value: afterHoursApprovals.length,
          expected_range: "0-3 per month",
          detected_at: now.toISOString(),
          metadata: { samples: afterHoursApprovals.slice(0, 3).map((t: any) => ({ id: t.id, time: t.created_at })) },
        });
      }
    }

    // Sort by severity
    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    anomalies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    console.log(`Detected ${anomalies.length} anomalies`);

    return new Response(JSON.stringify({
      anomalies,
      summary: {
        total: anomalies.length,
        critical: anomalies.filter(a => a.severity === "critical").length,
        high: anomalies.filter(a => a.severity === "high").length,
        medium: anomalies.filter(a => a.severity === "medium").length,
        low: anomalies.filter(a => a.severity === "low").length,
      },
      scanned_at: now.toISOString(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Anomaly detector error:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});