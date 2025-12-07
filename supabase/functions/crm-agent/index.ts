import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are an expert CRM AI Agent designed to help sales teams maximize their pipeline performance. You have access to tools that can query and analyze CRM data.

Your capabilities include:
1. **Pipeline Analysis**: Analyze opportunities by stage, value, and probability
2. **Sales Insights**: Identify trends, at-risk deals, and opportunities for follow-up
3. **Customer Intelligence**: Provide customer context and relationship insights
4. **Forecasting Support**: Help with revenue projections and target tracking
5. **Action Recommendations**: Suggest next best actions for deals

Guidelines:
- Always use tools to get real data before answering
- Provide specific, actionable recommendations
- Format currency values clearly
- Prioritize deals by value and urgency
- Be concise but thorough in your analysis`;

const tools = [
  {
    type: "function",
    function: {
      name: "get_pipeline_summary",
      description: "Get a summary of the sales pipeline including opportunity counts and values by stage",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_opportunities",
      description: "Get opportunities with optional filters. Use this to analyze specific deals or segments.",
      parameters: {
        type: "object",
        properties: {
          stage: {
            type: "string",
            enum: ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"],
            description: "Filter by opportunity stage",
          },
          min_value: {
            type: "number",
            description: "Minimum expected value filter",
          },
          limit: {
            type: "number",
            description: "Maximum number of opportunities to return (default 10)",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_details",
      description: "Get details about a specific customer including their opportunities",
      parameters: {
        type: "object",
        properties: {
          customer_name: {
            type: "string",
            description: "Name of the customer to look up",
          },
        },
        required: ["customer_name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_at_risk_deals",
      description: "Get deals that may be at risk - stale opportunities or low probability with high value",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_follow_up_recommendations",
      description: "Get recommended follow-up actions for opportunities",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "analyze_win_loss",
      description: "Analyze win/loss patterns and conversion rates",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
];

interface OpportunityBase {
  opportunity_name: string;
  stage: string;
  expected_value: number;
  probability?: number;
  expected_close_date?: string | null;
  source?: string | null;
  updated_at?: string;
  customers?: { name: string; email?: string } | null;
}

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  credit_limit: number | null;
  payment_terms: number | null;
}

// deno-lint-ignore no-explicit-any
type SupabaseClientType = ReturnType<typeof createClient<any>>;

async function executeTool(
  toolName: string,
  args: Record<string, unknown>,
  supabase: SupabaseClientType,
  orgId: string
): Promise<string> {
  console.log(`Executing tool: ${toolName} with args:`, args);

  try {
    switch (toolName) {
      case "get_pipeline_summary": {
        const { data: opportunities, error } = await supabase
          .from("opportunities")
          .select("stage, expected_value, probability")
          .eq("org_id", orgId);

        if (error) throw error;

        const opps = opportunities as { stage: string; expected_value: number; probability: number }[] || [];
        const summary = opps.reduce((acc, opp) => {
          if (!acc[opp.stage]) {
            acc[opp.stage] = { count: 0, total_value: 0, weighted_value: 0 };
          }
          acc[opp.stage].count++;
          acc[opp.stage].total_value += opp.expected_value || 0;
          acc[opp.stage].weighted_value += (opp.expected_value || 0) * ((opp.probability || 0) / 100);
          return acc;
        }, {} as Record<string, { count: number; total_value: number; weighted_value: number }>);

        const totalPipeline = Object.values(summary).reduce((sum, s) => sum + s.total_value, 0);
        const totalWeighted = Object.values(summary).reduce((sum, s) => sum + s.weighted_value, 0);

        return JSON.stringify({
          stages: summary,
          totals: {
            total_pipeline_value: totalPipeline,
            weighted_pipeline_value: totalWeighted,
            opportunity_count: opps.length,
          },
        });
      }

      case "get_opportunities": {
        let query = supabase
          .from("opportunities")
          .select("opportunity_name, stage, expected_value, probability, expected_close_date, source, customers(name)")
          .eq("org_id", orgId)
          .order("expected_value", { ascending: false });

        if (args.stage) {
          query = query.eq("stage", args.stage);
        }
        if (args.min_value) {
          query = query.gte("expected_value", args.min_value);
        }

        const limit = (args.limit as number) || 10;
        query = query.limit(limit);

        const { data, error } = await query;
        if (error) throw error;

        // deno-lint-ignore no-explicit-any
        const opps = (data || []) as any[];
        return JSON.stringify(
          opps.map((opp) => ({
            name: opp.opportunity_name,
            customer: opp.customers?.name,
            stage: opp.stage,
            value: opp.expected_value,
            probability: opp.probability,
            expected_close: opp.expected_close_date,
            source: opp.source,
          }))
        );
      }

      case "get_customer_details": {
        const { data: customers, error: custError } = await supabase
          .from("customers")
          .select("*")
          .eq("org_id", orgId)
          .ilike("name", `%${args.customer_name}%`)
          .limit(1);

        if (custError) throw custError;
        const custs = customers as Customer[] || [];
        if (!custs.length) return JSON.stringify({ error: "Customer not found" });

        const customer = custs[0];
        const { data: opportunities } = await supabase
          .from("opportunities")
          .select("opportunity_name, stage, expected_value, probability")
          .eq("customer_id", customer.id);

        const opps = opportunities as { opportunity_name: string; stage: string; expected_value: number; probability: number }[] || [];

        return JSON.stringify({
          customer: {
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            credit_limit: customer.credit_limit,
            payment_terms: customer.payment_terms,
          },
          opportunities: opps,
          total_pipeline: opps.reduce((sum, o) => sum + (o.expected_value || 0), 0),
        });
      }

      case "get_at_risk_deals": {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: opportunities, error } = await supabase
          .from("opportunities")
          .select("opportunity_name, stage, expected_value, updated_at, customers(name)")
          .eq("org_id", orgId)
          .not("stage", "in", "(closed_won,closed_lost)")
          .lt("updated_at", thirtyDaysAgo.toISOString())
          .order("expected_value", { ascending: false })
          .limit(10);

        if (error) throw error;

        // deno-lint-ignore no-explicit-any
        const opps = (opportunities || []) as any[];
        const atRisk = opps.map((opp) => ({
          name: opp.opportunity_name,
          customer: opp.customers?.name,
          stage: opp.stage,
          value: opp.expected_value,
          days_stale: opp.updated_at ? Math.floor((Date.now() - new Date(opp.updated_at).getTime()) / (1000 * 60 * 60 * 24)) : 0,
          risk_reason: "No activity in 30+ days",
        }));

        return JSON.stringify({ at_risk_deals: atRisk, count: atRisk.length });
      }

      case "get_follow_up_recommendations": {
        const { data: opportunities, error } = await supabase
          .from("opportunities")
          .select("opportunity_name, stage, expected_value, customers(name, email)")
          .eq("org_id", orgId)
          .not("stage", "in", "(closed_won,closed_lost)")
          .order("expected_value", { ascending: false })
          .limit(5);

        if (error) throw error;

        // deno-lint-ignore no-explicit-any
        const opps = (opportunities || []) as any[];
        const recommendations = opps.map((opp) => {
          let action = "";
          switch (opp.stage) {
            case "lead":
              action = "Schedule discovery call to qualify";
              break;
            case "qualified":
              action = "Prepare and send proposal";
              break;
            case "proposal":
              action = "Follow up on proposal, address questions";
              break;
            case "negotiation":
              action = "Push for final decision, address objections";
              break;
          }
          return {
            opportunity: opp.opportunity_name,
            customer: opp.customers?.name,
            value: opp.expected_value,
            stage: opp.stage,
            recommended_action: action,
            contact_email: opp.customers?.email,
          };
        });

        return JSON.stringify({ recommendations });
      }

      case "analyze_win_loss": {
        const { data: opportunities, error } = await supabase
          .from("opportunities")
          .select("stage, expected_value, source")
          .eq("org_id", orgId)
          .in("stage", ["closed_won", "closed_lost"]);

        if (error) throw error;

        const opps = opportunities as { stage: string; expected_value: number; source: string | null }[] || [];
        const won = opps.filter((o) => o.stage === "closed_won");
        const lost = opps.filter((o) => o.stage === "closed_lost");

        const winRate = opps.length ? (won.length / opps.length) * 100 : 0;
        const avgWonValue = won.length ? won.reduce((sum, o) => sum + (o.expected_value || 0), 0) / won.length : 0;
        const avgLostValue = lost.length ? lost.reduce((sum, o) => sum + (o.expected_value || 0), 0) / lost.length : 0;

        // Analyze by source
        const bySource = opps.reduce((acc, opp) => {
          const source = opp.source || "Unknown";
          if (!acc[source]) acc[source] = { won: 0, lost: 0 };
          if (opp.stage === "closed_won") acc[source].won++;
          else acc[source].lost++;
          return acc;
        }, {} as Record<string, { won: number; lost: number }>);

        return JSON.stringify({
          overall: {
            total_closed: opps.length,
            won: won.length,
            lost: lost.length,
            win_rate: winRate.toFixed(1) + "%",
            avg_won_deal_value: avgWonValue,
            avg_lost_deal_value: avgLostValue,
          },
          by_source: bySource,
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (error) {
    console.error(`Tool execution error:`, error);
    return JSON.stringify({ error: error instanceof Error ? error.message : "Tool execution failed" });
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    // Get org_id from auth header
    const authHeader = req.headers.get("authorization");
    const supabaseClient = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Get user's org_id
    let orgId: string | null = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabaseClient.auth.getUser(token);
      if (user) {
        const { data: profile } = await supabaseClient
          .from("profiles")
          .select("org_id")
          .eq("id", user.id)
          .single();
        orgId = profile?.org_id;
      }
    }

    if (!orgId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - could not determine organization" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`CRM Agent request for org: ${orgId}, messages: ${messages.length}`);

    // Initial API call with tools
    let response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...messages],
        tools,
        tool_choice: "auto",
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    let data = await response.json();
    let assistantMessage = data.choices[0].message;
    const conversationMessages = [...messages, assistantMessage];

    // Process tool calls in a loop
    while (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
      console.log(`Processing ${assistantMessage.tool_calls.length} tool calls`);

      const toolResults = await Promise.all(
        assistantMessage.tool_calls.map(async (toolCall: { id: string; function: { name: string; arguments: string } }) => {
          const args = JSON.parse(toolCall.function.arguments);
          const result = await executeTool(toolCall.function.name, args, supabaseClient, orgId!);
          return {
            role: "tool" as const,
            tool_call_id: toolCall.id,
            content: result,
          };
        })
      );

      conversationMessages.push(...toolResults);

      // Continue conversation with tool results
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: SYSTEM_PROMPT }, ...conversationMessages],
          tools,
          tool_choice: "auto",
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI API error on tool continuation:", response.status, errorText);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      data = await response.json();
      assistantMessage = data.choices[0].message;
      conversationMessages.push(assistantMessage);
    }

    console.log("CRM Agent response generated successfully");

    return new Response(
      JSON.stringify({ 
        content: assistantMessage.content,
        usage: data.usage
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("CRM Agent error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
