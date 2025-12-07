import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Context-specific system prompts
const contextPrompts: Record<string, string> = {
  crm: `You are a CRM AI Agent with expertise in sales pipeline management, customer relationships, and opportunity analysis.
You can help with:
- Pipeline analysis and summaries
- Opportunity insights and at-risk deals
- Customer information and history
- Win/loss pattern analysis
- Follow-up recommendations
- Sales forecasting

Be concise, data-driven, and actionable in your responses.`,

  finance: `You are a Finance AI Copilot with expertise in financial operations and accounting.
You can help with:
- Financial metrics and KPIs (AR, AP, GL)
- Invoice and bill management
- Bank reconciliation
- Period close procedures
- Financial reporting
- Cash flow analysis

Be precise with numbers and provide clear financial guidance.`,

  inventory: `You are an Inventory Management AI Assistant.
You can help with:
- Stock levels and availability
- Warehouse operations
- Product tracking and batch/lot management
- Cycle counts and inventory adjustments
- Stock transfers and consignment
- Reorder recommendations

Provide accurate inventory insights and operational recommendations.`,

  production: `You are a Production Planning AI Assistant.
You can help with:
- Production orders and scheduling
- Bill of Materials (BOM) management
- Work center capacity and utilization
- MRP (Material Requirements Planning)
- Production efficiency analysis
- Component and operation tracking

Focus on manufacturing efficiency and resource optimization.`,

  controlling: `You are a Controlling (CO) AI Agent with expertise in cost accounting, management reporting, and financial controlling.
You can help with:
- Cost center analysis and reporting
- Internal order management and tracking
- Budget vs actual variance analysis
- CO document review (cost postings from GL)
- Profitability analysis by cost center/internal order
- Cash flow forecasting and analysis
- Fixed asset depreciation and tracking
- Project cost monitoring

You understand the integration between GL and CO:
- GL is the single source of truth for legal accounting
- CO tracks costs by cost centers and internal orders for management reporting
- All GL postings with controlling_category != 'NO_CO' create CO documents
- Banking impacts CO only indirectly through GL postings

Be precise with cost allocations and provide actionable controlling insights.`,

  default: `You are a helpful ERP AI Assistant for business operations.
You can assist with various business functions including CRM, Finance, Inventory, Production, and Controlling.
Provide clear, actionable guidance based on the user's questions.`
};

// Context-specific tools
const crmTools = [
  {
    type: "function",
    function: {
      name: "get_pipeline_summary",
      description: "Get a summary of the sales pipeline including total opportunities, values by stage, and key metrics",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_opportunities",
      description: "Get opportunities filtered by stage, value, or other criteria",
      parameters: {
        type: "object",
        properties: {
          stage: { type: "string", description: "Filter by stage (lead, qualified, proposal, negotiation, closed_won, closed_lost)" },
          min_value: { type: "number", description: "Minimum expected value" },
          limit: { type: "number", description: "Maximum number of results" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_at_risk_deals",
      description: "Identify deals that are at risk based on age, stalled progress, or approaching close dates",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "analyze_win_loss",
      description: "Analyze win/loss patterns and provide insights",
      parameters: { type: "object", properties: {}, required: [] }
    }
  }
];

const financeTools = [
  {
    type: "function",
    function: {
      name: "get_ar_summary",
      description: "Get accounts receivable summary including aging buckets and totals",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_ap_summary",
      description: "Get accounts payable summary including outstanding bills and payment schedule",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_cash_position",
      description: "Get current cash position across all bank accounts",
      parameters: { type: "object", properties: {}, required: [] }
    }
  }
];

const inventoryTools = [
  {
    type: "function",
    function: {
      name: "get_stock_levels",
      description: "Get current stock levels for products",
      parameters: {
        type: "object",
        properties: {
          low_stock_only: { type: "boolean", description: "Only show items below reorder point" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_warehouse_summary",
      description: "Get summary of warehouse operations and capacity",
      parameters: { type: "object", properties: {}, required: [] }
    }
  }
];

const controllingTools = [
  {
    type: "function",
    function: {
      name: "get_cost_centers",
      description: "Get list of cost centers with their status and hierarchy",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_internal_orders",
      description: "Get internal orders for overhead cost tracking",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["open", "closed"], description: "Filter by status" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_co_documents",
      description: "Get controlling documents that were created from GL journal entries",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "number", description: "Maximum number of documents to return" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_cost_center_balance",
      description: "Get the balance/spending for a specific cost center",
      parameters: {
        type: "object",
        properties: {
          cost_center_code: { type: "string", description: "Cost center code to look up" }
        },
        required: ["cost_center_code"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_budget_variance",
      description: "Get budget vs actual variance analysis",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_fixed_assets",
      description: "Get fixed assets with depreciation status",
      parameters: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["active", "disposed", "fully_depreciated"], description: "Filter by status" }
        },
        required: []
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_cash_flow_forecast",
      description: "Get cash flow forecast data",
      parameters: { type: "object", properties: {}, required: [] }
    }
  },
  {
    type: "function",
    function: {
      name: "get_project_costs",
      description: "Get project cost summary",
      parameters: { type: "object", properties: {}, required: [] }
    }
  }
];

function getToolsForContext(context: string) {
  switch (context) {
    case 'crm': return crmTools;
    case 'finance': 
    case 'receivables':
    case 'payables':
    case 'general-ledger':
    case 'banking':
      return financeTools;
    case 'inventory': return inventoryTools;
    case 'controlling': return controllingTools;
    default: return [];
  }
}

async function executeTool(toolName: string, args: any, supabase: any): Promise<string> {
  console.log(`Executing tool: ${toolName}`, args);
  
  try {
    switch (toolName) {
      case 'get_pipeline_summary': {
        const { data: opportunities } = await supabase.from('opportunities').select('*');
        if (!opportunities?.length) return JSON.stringify({ message: "No opportunities found in pipeline" });
        
        const stages = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
        const summary = stages.map(stage => {
          const stageOpps = opportunities.filter((o: any) => o.stage === stage);
          return {
            stage,
            count: stageOpps.length,
            total_value: stageOpps.reduce((sum: number, o: any) => sum + (o.expected_value || 0), 0)
          };
        });
        
        return JSON.stringify({
          total_opportunities: opportunities.length,
          total_pipeline_value: opportunities.reduce((sum: number, o: any) => sum + (o.expected_value || 0), 0),
          by_stage: summary
        });
      }
      
      case 'get_opportunities': {
        let query = supabase.from('opportunities').select('*, customers(name)');
        if (args.stage) query = query.eq('stage', args.stage);
        if (args.min_value) query = query.gte('expected_value', args.min_value);
        query = query.limit(args.limit || 10);
        
        const { data } = await query;
        return JSON.stringify(data || []);
      }
      
      case 'get_at_risk_deals': {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data: opportunities } = await supabase
          .from('opportunities')
          .select('*, customers(name)')
          .not('stage', 'in', '("closed_won","closed_lost")')
          .lt('updated_at', thirtyDaysAgo.toISOString());
        
        const { data: closingSoon } = await supabase
          .from('opportunities')
          .select('*, customers(name)')
          .not('stage', 'in', '("closed_won","closed_lost")')
          .lte('expected_close_date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
        
        return JSON.stringify({
          stalled_deals: opportunities || [],
          closing_soon: closingSoon || []
        });
      }
      
      case 'analyze_win_loss': {
        const { data: won } = await supabase.from('opportunities').select('*').eq('stage', 'closed_won');
        const { data: lost } = await supabase.from('opportunities').select('*').eq('stage', 'closed_lost');
        
        const winRate = won && lost ? (won.length / (won.length + lost.length) * 100).toFixed(1) : 0;
        const avgWonValue = won?.length ? won.reduce((s: number, o: any) => s + (o.expected_value || 0), 0) / won.length : 0;
        const avgLostValue = lost?.length ? lost.reduce((s: number, o: any) => s + (o.expected_value || 0), 0) / lost.length : 0;
        
        return JSON.stringify({
          win_rate: `${winRate}%`,
          total_won: won?.length || 0,
          total_lost: lost?.length || 0,
          avg_won_deal_value: avgWonValue,
          avg_lost_deal_value: avgLostValue,
          common_lost_reasons: lost?.filter((o: any) => o.lost_reason).map((o: any) => o.lost_reason) || []
        });
      }
      
      case 'get_ar_summary': {
        const { data: invoices } = await supabase.from('invoices').select('*').neq('status', 'paid');
        const total = invoices?.reduce((s: number, i: any) => s + (i.total - i.amount_paid), 0) || 0;
        return JSON.stringify({ total_outstanding: total, count: invoices?.length || 0 });
      }
      
      case 'get_ap_summary': {
        const { data: bills } = await supabase.from('bills').select('*').neq('status', 'paid');
        const total = bills?.reduce((s: number, b: any) => s + (b.total - b.amount_paid), 0) || 0;
        return JSON.stringify({ total_outstanding: total, count: bills?.length || 0 });
      }
      
      case 'get_cash_position': {
        const { data: accounts } = await supabase.from('bank_accounts').select('*').eq('is_active', true);
        const total = accounts?.reduce((s: number, a: any) => s + (a.current_balance || 0), 0) || 0;
        return JSON.stringify({ total_cash: total, accounts: accounts?.length || 0 });
      }
      
      case 'get_stock_levels': {
        let query = supabase.from('inventory_stock').select('*, products(name, sku)');
        const { data } = await query.limit(20);
        return JSON.stringify(data || []);
      }
      
      case 'get_warehouse_summary': {
        const { data: warehouses } = await supabase.from('warehouses').select('*').eq('is_active', true);
        return JSON.stringify(warehouses || []);
      }

      // Controlling tools
      case 'get_cost_centers': {
        const { data: costCenters } = await supabase.from('cost_centers').select('*').eq('is_active', true);
        return JSON.stringify(costCenters || []);
      }

      case 'get_internal_orders': {
        let query = supabase.from('internal_orders').select('*');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_co_documents': {
        const { data: coDocs } = await supabase
          .from('co_documents')
          .select('*, journal_entries(entry_number, memo, entry_date)')
          .order('created_at', { ascending: false })
          .limit(args.limit || 10);
        return JSON.stringify(coDocs || []);
      }

      case 'get_cost_center_balance': {
        const { data: costCenter } = await supabase
          .from('cost_centers')
          .select('id, code, name')
          .eq('code', args.cost_center_code)
          .maybeSingle();

        if (!costCenter) return JSON.stringify({ error: "Cost center not found" });

        const { data: coLines } = await supabase
          .from('co_document_lines')
          .select('amount')
          .eq('cost_center_id', costCenter.id);

        const totalAmount = coLines?.reduce((sum: number, line: any) => sum + (line.amount || 0), 0) || 0;

        return JSON.stringify({
          cost_center: costCenter,
          total_costs: totalAmount,
          line_count: coLines?.length || 0
        });
      }

      case 'get_budget_variance': {
        const { data: budgets } = await supabase
          .from('budgets')
          .select('*, budget_lines(*)')
          .eq('status', 'approved')
          .limit(5);

        const variance = budgets?.map((b: any) => {
          const totalBudgeted = b.budget_lines?.reduce((s: number, l: any) => s + (l.budgeted_amount || 0), 0) || 0;
          const totalActual = b.budget_lines?.reduce((s: number, l: any) => s + (l.actual_amount || 0), 0) || 0;
          return {
            budget: b.name,
            fiscal_year: b.fiscal_year,
            budgeted: totalBudgeted,
            actual: totalActual,
            variance: totalBudgeted - totalActual,
            variance_pct: totalBudgeted > 0 ? ((totalBudgeted - totalActual) / totalBudgeted * 100).toFixed(1) : 0
          };
        }) || [];

        return JSON.stringify(variance);
      }

      case 'get_fixed_assets': {
        let query = supabase.from('fixed_assets').select('*');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_cash_flow_forecast': {
        const { data: forecasts } = await supabase
          .from('cash_flow_forecasts')
          .select('*')
          .gte('forecast_date', new Date().toISOString().split('T')[0])
          .order('forecast_date', { ascending: true })
          .limit(30);

        const summary = forecasts?.reduce((acc: any, f: any) => {
          acc.total_expected_inflow += f.expected_inflow || 0;
          acc.total_expected_outflow += f.expected_outflow || 0;
          return acc;
        }, { total_expected_inflow: 0, total_expected_outflow: 0 });

        return JSON.stringify({
          forecast_count: forecasts?.length || 0,
          ...summary,
          net_cash_flow: (summary?.total_expected_inflow || 0) - (summary?.total_expected_outflow || 0),
          recent_forecasts: forecasts?.slice(0, 10) || []
        });
      }

      case 'get_project_costs': {
        const { data: projects } = await supabase
          .from('projects')
          .select('*, cost_centers(name)')
          .limit(10);

        return JSON.stringify(projects?.map((p: any) => ({
          project_number: p.project_number,
          name: p.name,
          status: p.status,
          budget: p.budget_amount,
          actual: p.actual_cost,
          variance: (p.budget_amount || 0) - (p.actual_cost || 0),
          cost_center: p.cost_centers?.name
        })) || []);
      }
      
      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (error) {
    console.error(`Tool execution error: ${toolName}`, error);
    return JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, context = 'default' } = await req.json();
    console.log('Unified agent request - context:', context);

    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);
    const systemPrompt = contextPrompts[context] || contextPrompts.default;
    const tools = getToolsForContext(context);

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    const requestBody: any = {
      model: 'gpt-4o-mini',
      messages: apiMessages,
      temperature: 0.7,
    };

    if (tools.length > 0) {
      requestBody.tools = tools;
      requestBody.tool_choice = 'auto';
    }

    let response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    let data = await response.json();
    let assistantMessage = data.choices[0].message;

    // Handle tool calls
    while (assistantMessage.tool_calls) {
      const toolResults = [];
      
      for (const toolCall of assistantMessage.tool_calls) {
        const args = JSON.parse(toolCall.function.arguments || '{}');
        const result = await executeTool(toolCall.function.name, args, supabase);
        toolResults.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result
        });
      }

      apiMessages.push(assistantMessage);
      apiMessages.push(...toolResults);

      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: apiMessages,
          temperature: 0.7,
        }),
      });

      data = await response.json();
      assistantMessage = data.choices[0].message;
    }

    return new Response(JSON.stringify({ response: assistantMessage.content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Unified agent error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
