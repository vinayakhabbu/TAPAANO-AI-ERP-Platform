import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const openAIApiKey = Deno.env.get("OPENAI_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ============================================================================
// AGENT RIVER - Unified Multi-Agent Orchestrator
// ============================================================================

const AGENT_RIVER_SYSTEM = `You are Agent River, the unified AI orchestrator for an enterprise ERP system.

You have access to specialized sub-agents that you can delegate tasks to:
1. **crm_agent**: Sales pipeline, opportunities, customer relationships, win/loss analysis
2. **finance_agent**: AR/AP, cash position, bank transactions, journal entries, financial metrics
3. **inventory_agent**: Stock levels, warehouses, products, transfers, cycle counts, batch/serial tracking
4. **production_agent**: BOMs, production orders, work centers, MRP, capacity planning
5. **controlling_agent**: Cost centers, internal orders, budget variance, CO documents, fixed assets
6. **service_agent**: Service contracts, warranties, service calls, field visits

When a user asks a question:
1. Analyze which agent(s) can best answer the question
2. Call the appropriate agent tool(s) with a clear, specific task
3. Synthesize the results into a cohesive response

You can call multiple agents in parallel for complex queries that span modules.
Always provide actionable, data-driven insights. Format numbers clearly.`;

// Sub-agent definitions
const SUB_AGENTS = {
  crm_agent: {
    description: "Handles CRM queries: sales pipeline, opportunities, customer insights, win/loss analysis, at-risk deals",
    prompt: `You are a CRM specialist. Analyze sales data and provide insights. Use available tools to query opportunities, customers, and pipeline data.`,
    tools: [
      { type: "function", function: { name: "get_pipeline_summary", description: "Get sales pipeline summary by stage", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_opportunities", description: "Get opportunities with filters", parameters: { type: "object", properties: { stage: { type: "string", enum: ["lead", "qualified", "proposal", "negotiation", "closed_won", "closed_lost"] }, min_value: { type: "number" }, limit: { type: "number" } }, required: [] } } },
      { type: "function", function: { name: "get_at_risk_deals", description: "Identify stalled or at-risk deals", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "analyze_win_loss", description: "Analyze win/loss patterns", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_customers", description: "Get customer list", parameters: { type: "object", properties: { search: { type: "string" } }, required: [] } } },
    ]
  },
  finance_agent: {
    description: "Handles finance queries: AR/AP, cash position, invoices, bills, payments, journal entries",
    prompt: `You are a finance specialist. Analyze financial data and provide insights. Use tools to query AR, AP, banking, and GL data.`,
    tools: [
      { type: "function", function: { name: "get_ar_aging", description: "Get AR aging summary", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_ap_summary", description: "Get AP summary", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_cash_position", description: "Get cash position across bank accounts", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_invoices", description: "Get invoices", parameters: { type: "object", properties: { status: { type: "string", enum: ["draft", "sent", "paid", "overdue"] }, customer_name: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_bills", description: "Get bills", parameters: { type: "object", properties: { status: { type: "string", enum: ["draft", "pending", "paid", "overdue"] }, vendor_name: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_journal_entries", description: "Get journal entries", parameters: { type: "object", properties: { status: { type: "string", enum: ["draft", "posted", "reversed"] } }, required: [] } } },
      { type: "function", function: { name: "get_bank_transactions", description: "Get bank transactions", parameters: { type: "object", properties: { status: { type: "string", enum: ["pending", "matched", "reconciled"] } }, required: [] } } },
    ]
  },
  inventory_agent: {
    description: "Handles inventory queries: stock levels, warehouses, products, transfers, cycle counts",
    prompt: `You are an inventory specialist. Analyze stock levels and warehouse operations. Use tools to query inventory data.`,
    tools: [
      { type: "function", function: { name: "get_stock_levels", description: "Get current stock levels", parameters: { type: "object", properties: { low_stock_only: { type: "boolean" } }, required: [] } } },
      { type: "function", function: { name: "get_warehouse_summary", description: "Get warehouse summary", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_products", description: "Get products", parameters: { type: "object", properties: { search: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_inventory_transactions", description: "Get inventory movements", parameters: { type: "object", properties: { type: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_cycle_counts", description: "Get cycle count status", parameters: { type: "object", properties: {}, required: [] } } },
    ]
  },
  production_agent: {
    description: "Handles production queries: BOMs, production orders, work centers, MRP, capacity",
    prompt: `You are a production planning specialist. Analyze manufacturing data. Use tools to query production information.`,
    tools: [
      { type: "function", function: { name: "get_production_orders", description: "Get production orders", parameters: { type: "object", properties: { status: { type: "string", enum: ["planned", "released", "in_progress", "completed"] } }, required: [] } } },
      { type: "function", function: { name: "get_boms", description: "Get bills of materials", parameters: { type: "object", properties: { product_name: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_work_centers", description: "Get work centers with capacity", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_capacity_utilization", description: "Get capacity utilization", parameters: { type: "object", properties: {}, required: [] } } },
    ]
  },
  controlling_agent: {
    description: "Handles controlling queries: cost centers, internal orders, budget variance, CO documents, fixed assets",
    prompt: `You are a controlling specialist. Analyze cost accounting and management reporting data.`,
    tools: [
      { type: "function", function: { name: "get_cost_centers", description: "Get cost centers", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_internal_orders", description: "Get internal orders", parameters: { type: "object", properties: { status: { type: "string", enum: ["open", "closed"] } }, required: [] } } },
      { type: "function", function: { name: "get_budget_variance", description: "Get budget vs actual variance", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_co_documents", description: "Get CO documents", parameters: { type: "object", properties: { limit: { type: "number" } }, required: [] } } },
      { type: "function", function: { name: "get_fixed_assets", description: "Get fixed assets", parameters: { type: "object", properties: { status: { type: "string", enum: ["active", "disposed", "fully_depreciated"] } }, required: [] } } },
      { type: "function", function: { name: "get_cash_flow_forecast", description: "Get cash flow forecast", parameters: { type: "object", properties: {}, required: [] } } },
    ]
  },
  service_agent: {
    description: "Handles service queries: service contracts, warranties, service calls, field visits",
    prompt: `You are a service management specialist. Analyze service operations data.`,
    tools: [
      { type: "function", function: { name: "get_service_contracts", description: "Get service contracts", parameters: { type: "object", properties: { status: { type: "string", enum: ["active", "expired", "pending"] } }, required: [] } } },
      { type: "function", function: { name: "get_warranties", description: "Get warranties", parameters: { type: "object", properties: { status: { type: "string", enum: ["active", "expired", "claimed"] } }, required: [] } } },
      { type: "function", function: { name: "get_service_calls", description: "Get service calls", parameters: { type: "object", properties: { status: { type: "string", enum: ["open", "in_progress", "pending_parts", "completed"] }, priority: { type: "string", enum: ["low", "medium", "high", "critical"] } }, required: [] } } },
      { type: "function", function: { name: "get_field_visits", description: "Get field service visits", parameters: { type: "object", properties: { status: { type: "string", enum: ["scheduled", "in_progress", "completed", "cancelled"] } }, required: [] } } },
      { type: "function", function: { name: "get_service_stats", description: "Get service management KPIs", parameters: { type: "object", properties: {}, required: [] } } },
    ]
  }
};

// Orchestrator tools - these call sub-agents
const ORCHESTRATOR_TOOLS = [
  {
    type: "function",
    function: {
      name: "call_crm_agent",
      description: "Delegate CRM-related queries: sales pipeline, opportunities, customer insights, win/loss analysis",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The specific task or question for the CRM agent" }
        },
        required: ["task"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "call_finance_agent",
      description: "Delegate finance queries: AR/AP, cash position, invoices, bills, journal entries",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The specific task or question for the Finance agent" }
        },
        required: ["task"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "call_inventory_agent",
      description: "Delegate inventory queries: stock levels, warehouses, products, transfers",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The specific task or question for the Inventory agent" }
        },
        required: ["task"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "call_production_agent",
      description: "Delegate production queries: BOMs, production orders, work centers, MRP",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The specific task or question for the Production agent" }
        },
        required: ["task"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "call_controlling_agent",
      description: "Delegate controlling queries: cost centers, internal orders, budget variance, fixed assets",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The specific task or question for the Controlling agent" }
        },
        required: ["task"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "call_service_agent",
      description: "Delegate service queries: service contracts, warranties, service calls, field visits",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The specific task or question for the Service agent" }
        },
        required: ["task"]
      }
    }
  }
];

// ============================================================================
// TOOL EXECUTION - Database queries
// ============================================================================

async function executeSubAgentTool(toolName: string, args: any, supabase: any): Promise<string> {
  console.log(`Executing sub-agent tool: ${toolName}`, args);
  
  try {
    switch (toolName) {
      // CRM Tools
      case 'get_pipeline_summary': {
        const { data: opportunities } = await supabase.from('opportunities').select('*');
        if (!opportunities?.length) return JSON.stringify({ message: "No opportunities found" });
        
        const stages = ['lead', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
        const summary = stages.map(stage => ({
          stage,
          count: opportunities.filter((o: any) => o.stage === stage).length,
          total_value: opportunities.filter((o: any) => o.stage === stage).reduce((sum: number, o: any) => sum + (o.expected_value || 0), 0)
        }));
        
        return JSON.stringify({
          total_opportunities: opportunities.length,
          total_pipeline_value: opportunities.reduce((sum: number, o: any) => sum + (o.expected_value || 0), 0),
          weighted_value: opportunities.reduce((sum: number, o: any) => sum + ((o.expected_value || 0) * ((o.probability || 0) / 100)), 0),
          by_stage: summary
        });
      }

      case 'get_opportunities': {
        let query = supabase.from('opportunities').select('*, customers(name)');
        if (args.stage) query = query.eq('stage', args.stage);
        if (args.min_value) query = query.gte('expected_value', args.min_value);
        const { data } = await query.order('expected_value', { ascending: false }).limit(args.limit || 10);
        return JSON.stringify(data || []);
      }

      case 'get_at_risk_deals': {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { data: stalled } = await supabase
          .from('opportunities')
          .select('*, customers(name)')
          .not('stage', 'in', '("closed_won","closed_lost")')
          .lt('updated_at', thirtyDaysAgo.toISOString())
          .order('expected_value', { ascending: false });
        
        return JSON.stringify({
          at_risk_count: stalled?.length || 0,
          deals: stalled?.map((o: any) => ({
            name: o.opportunity_name,
            customer: o.customers?.name,
            value: o.expected_value,
            stage: o.stage,
            days_stale: Math.floor((Date.now() - new Date(o.updated_at).getTime()) / (1000 * 60 * 60 * 24))
          })) || []
        });
      }

      case 'analyze_win_loss': {
        const { data: won } = await supabase.from('opportunities').select('*').eq('stage', 'closed_won');
        const { data: lost } = await supabase.from('opportunities').select('*').eq('stage', 'closed_lost');
        
        const winRate = won && lost ? (won.length / (won.length + lost.length) * 100).toFixed(1) : 0;
        return JSON.stringify({
          win_rate: `${winRate}%`,
          total_won: won?.length || 0,
          total_lost: lost?.length || 0,
          avg_won_value: won?.length ? won.reduce((s: number, o: any) => s + (o.expected_value || 0), 0) / won.length : 0,
          avg_lost_value: lost?.length ? lost.reduce((s: number, o: any) => s + (o.expected_value || 0), 0) / lost.length : 0
        });
      }

      case 'get_customers': {
        let query = supabase.from('customers').select('*');
        if (args.search) query = query.ilike('name', `%${args.search}%`);
        const { data } = await query.limit(20);
        return JSON.stringify(data || []);
      }

      // Finance Tools
      case 'get_ar_aging': {
        const { data: invoices } = await supabase.from('invoices').select('*, customers(name)').neq('status', 'paid');
        const now = new Date();
        
        const aging = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, over_90: 0 };
        invoices?.forEach((inv: any) => {
          const dueDate = new Date(inv.due_date);
          const daysOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          const amount = inv.total - inv.amount_paid;
          
          if (daysOverdue <= 0) aging.current += amount;
          else if (daysOverdue <= 30) aging.days_1_30 += amount;
          else if (daysOverdue <= 60) aging.days_31_60 += amount;
          else if (daysOverdue <= 90) aging.days_61_90 += amount;
          else aging.over_90 += amount;
        });

        return JSON.stringify({
          total_outstanding: Object.values(aging).reduce((a, b) => a + b, 0),
          invoice_count: invoices?.length || 0,
          aging
        });
      }

      case 'get_ap_summary': {
        const { data: bills } = await supabase.from('bills').select('*, vendors(name)').neq('status', 'paid');
        const total = bills?.reduce((s: number, b: any) => s + (b.total - b.amount_paid), 0) || 0;
        const overdue = bills?.filter((b: any) => new Date(b.due_date) < new Date());
        
        return JSON.stringify({
          total_outstanding: total,
          bill_count: bills?.length || 0,
          overdue_count: overdue?.length || 0,
          overdue_amount: overdue?.reduce((s: number, b: any) => s + (b.total - b.amount_paid), 0) || 0
        });
      }

      case 'get_cash_position': {
        const { data: accounts } = await supabase.from('bank_accounts').select('*').eq('is_active', true);
        const total = accounts?.reduce((s: number, a: any) => s + (a.current_balance || 0), 0) || 0;
        return JSON.stringify({
          total_cash: total,
          account_count: accounts?.length || 0,
          accounts: accounts?.map((a: any) => ({ name: a.name, balance: a.current_balance, currency: a.currency })) || []
        });
      }

      case 'get_invoices': {
        let query = supabase.from('invoices').select('*, customers(name)');
        if (args.status) query = query.eq('status', args.status);
        if (args.customer_name) query = query.ilike('customers.name', `%${args.customer_name}%`);
        const { data } = await query.order('created_at', { ascending: false }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_bills': {
        let query = supabase.from('bills').select('*, vendors(name)');
        if (args.status) query = query.eq('status', args.status);
        if (args.vendor_name) query = query.ilike('vendors.name', `%${args.vendor_name}%`);
        const { data } = await query.order('created_at', { ascending: false }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_journal_entries': {
        let query = supabase.from('journal_entries').select('*');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.order('entry_date', { ascending: false }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_bank_transactions': {
        let query = supabase.from('bank_transactions').select('*, bank_accounts(name)');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.order('transaction_date', { ascending: false }).limit(20);
        return JSON.stringify(data || []);
      }

      // Inventory Tools
      case 'get_stock_levels': {
        let query = supabase.from('inventory_stock').select('*, products(name, sku, reorder_point), warehouses(name)');
        const { data } = await query.limit(30);
        
        const result = data?.map((s: any) => ({
          product: s.products?.name,
          sku: s.products?.sku,
          warehouse: s.warehouses?.name,
          on_hand: s.quantity_on_hand,
          reserved: s.quantity_reserved,
          available: s.quantity_available,
          reorder_point: s.products?.reorder_point,
          low_stock: s.quantity_on_hand <= (s.products?.reorder_point || 0)
        })) || [];

        if (args.low_stock_only) {
          return JSON.stringify(result.filter((s: any) => s.low_stock));
        }
        return JSON.stringify(result);
      }

      case 'get_warehouse_summary': {
        const { data: warehouses } = await supabase.from('warehouses').select('*').eq('is_active', true);
        return JSON.stringify(warehouses || []);
      }

      case 'get_products': {
        let query = supabase.from('products').select('*').eq('is_active', true);
        if (args.search) {
          query = query.or(`name.ilike.%${args.search}%,sku.ilike.%${args.search}%`);
        }
        const { data } = await query.limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_inventory_transactions': {
        let query = supabase.from('inventory_transactions').select('*, products(name), warehouses(name)');
        if (args.type) query = query.eq('transaction_type', args.type);
        const { data } = await query.order('created_at', { ascending: false }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_cycle_counts': {
        const { data } = await supabase.from('cycle_counts').select('*, warehouses(name)').order('scheduled_date', { ascending: false }).limit(10);
        return JSON.stringify(data || []);
      }

      // Production Tools
      case 'get_production_orders': {
        let query = supabase.from('production_orders').select('*, products(name)');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.order('created_at', { ascending: false }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_boms': {
        let query = supabase.from('bom_headers').select('*, products(name)');
        if (args.product_name) query = query.ilike('products.name', `%${args.product_name}%`);
        const { data } = await query.eq('is_active', true).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_work_centers': {
        const { data } = await supabase.from('work_centers').select('*').eq('is_active', true);
        return JSON.stringify(data || []);
      }

      case 'get_capacity_utilization': {
        const { data } = await supabase.from('capacity_schedules').select('*, work_centers(name)').order('schedule_date', { ascending: false }).limit(30);
        const utilization = data?.map((c: any) => ({
          work_center: c.work_centers?.name,
          date: c.schedule_date,
          available_hours: c.available_hours,
          planned_hours: c.planned_hours,
          actual_hours: c.actual_hours,
          utilization_pct: c.utilization_rate
        })) || [];
        return JSON.stringify(utilization);
      }

      // Controlling Tools
      case 'get_cost_centers': {
        const { data } = await supabase.from('cost_centers').select('*').eq('is_active', true);
        return JSON.stringify(data || []);
      }

      case 'get_internal_orders': {
        let query = supabase.from('internal_orders').select('*');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_budget_variance': {
        const { data: budgets } = await supabase.from('budgets').select('*, budget_lines(*)').eq('status', 'approved').limit(5);
        
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

      case 'get_co_documents': {
        const { data } = await supabase.from('co_documents').select('*, journal_entries(entry_number, memo)').order('created_at', { ascending: false }).limit(args.limit || 10);
        return JSON.stringify(data || []);
      }

      case 'get_fixed_assets': {
        let query = supabase.from('fixed_assets').select('*');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_cash_flow_forecast': {
        const { data } = await supabase.from('cash_flow_forecasts').select('*').gte('forecast_date', new Date().toISOString().split('T')[0]).order('forecast_date', { ascending: true }).limit(30);
        
        const summary = data?.reduce((acc: any, f: any) => {
          acc.total_inflow += f.expected_inflow || 0;
          acc.total_outflow += f.expected_outflow || 0;
          return acc;
        }, { total_inflow: 0, total_outflow: 0 }) || { total_inflow: 0, total_outflow: 0 };

        return JSON.stringify({
          forecast_count: data?.length || 0,
          ...summary,
          net_cash_flow: summary.total_inflow - summary.total_outflow
        });
      }

      // Service Tools
      case 'get_service_contracts': {
        let query = supabase.from('service_contracts').select('*, customers(name)');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.order('end_date', { ascending: true }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_warranties': {
        let query = supabase.from('warranties').select('*, customers(name), products(name)');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.order('end_date', { ascending: true }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_service_calls': {
        let query = supabase.from('service_calls').select('*, customers(name)');
        if (args.status) query = query.eq('status', args.status);
        if (args.priority) query = query.eq('priority', args.priority);
        const { data } = await query.order('created_at', { ascending: false }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_field_visits': {
        let query = supabase.from('field_service_visits').select('*, customers(name), service_calls(call_number)');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.order('scheduled_start', { ascending: true }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_service_stats': {
        const { data: contracts } = await supabase.from('service_contracts').select('status');
        const { data: warranties } = await supabase.from('warranties').select('status');
        const { data: calls } = await supabase.from('service_calls').select('status, priority');
        const { data: visits } = await supabase.from('field_service_visits').select('status');

        return JSON.stringify({
          active_contracts: contracts?.filter((c: any) => c.status === 'active').length || 0,
          active_warranties: warranties?.filter((w: any) => w.status === 'active').length || 0,
          open_calls: calls?.filter((c: any) => !['completed', 'cancelled'].includes(c.status)).length || 0,
          critical_calls: calls?.filter((c: any) => c.priority === 'critical' && !['completed', 'cancelled'].includes(c.status)).length || 0,
          scheduled_visits: visits?.filter((v: any) => v.status === 'scheduled').length || 0
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (error) {
    console.error(`Tool error: ${toolName}`, error);
    return JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' });
  }
}

// ============================================================================
// SUB-AGENT EXECUTION
// ============================================================================

async function executeSubAgent(agentName: string, task: string, supabase: any): Promise<{ response: string; toolCalls: number }> {
  const agent = SUB_AGENTS[agentName as keyof typeof SUB_AGENTS];
  if (!agent) {
    return { response: `Unknown agent: ${agentName}`, toolCalls: 0 };
  }

  console.log(`Executing sub-agent: ${agentName} with task: ${task}`);

  const messages = [
    { role: 'system', content: agent.prompt },
    { role: 'user', content: task }
  ];

  let toolCallCount = 0;

  // Initial call with tools
  let response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages,
      tools: agent.tools,
      tool_choice: 'auto',
      max_completion_tokens: 2000,
    }),
  });

  let data = await response.json();
  let assistantMessage = data.choices[0].message;

  // Process tool calls
  while (assistantMessage.tool_calls) {
    toolCallCount += assistantMessage.tool_calls.length;
    const toolResults = [];

    for (const toolCall of assistantMessage.tool_calls) {
      const args = JSON.parse(toolCall.function.arguments || '{}');
      const result = await executeSubAgentTool(toolCall.function.name, args, supabase);
      toolResults.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: result
      });
    }

    messages.push(assistantMessage);
    messages.push(...toolResults);

    response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages,
        tools: agent.tools,
        tool_choice: 'auto',
        max_completion_tokens: 2000,
      }),
    });

    data = await response.json();
    assistantMessage = data.choices[0].message;
  }

  return { response: assistantMessage.content, toolCalls: toolCallCount };
}

// ============================================================================
// ORCHESTRATOR TOOL EXECUTION
// ============================================================================

async function executeOrchestratorTool(toolName: string, args: any, supabase: any): Promise<string> {
  const agentMap: Record<string, string> = {
    'call_crm_agent': 'crm_agent',
    'call_finance_agent': 'finance_agent',
    'call_inventory_agent': 'inventory_agent',
    'call_production_agent': 'production_agent',
    'call_controlling_agent': 'controlling_agent',
    'call_service_agent': 'service_agent',
  };

  const agentName = agentMap[toolName];
  if (!agentName) {
    return JSON.stringify({ error: `Unknown orchestrator tool: ${toolName}` });
  }

  const result = await executeSubAgent(agentName, args.task, supabase);
  return JSON.stringify({
    agent: agentName,
    response: result.response,
    tool_calls_made: result.toolCalls
  });
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    console.log('Agent River request - messages:', messages.length);

    if (!openAIApiKey) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const apiMessages = [
      { role: 'system', content: AGENT_RIVER_SYSTEM },
      ...messages
    ];

    // Initial orchestrator call
    let response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: apiMessages,
        tools: ORCHESTRATOR_TOOLS,
        tool_choice: 'auto',
        max_completion_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    let data = await response.json();
    let assistantMessage = data.choices[0].message;
    let totalToolCalls = 0;
    let agentsUsed: string[] = [];

    // Process orchestrator tool calls (sub-agent delegations)
    while (assistantMessage.tool_calls) {
      const toolResults = [];

      for (const toolCall of assistantMessage.tool_calls) {
        totalToolCalls++;
        const args = JSON.parse(toolCall.function.arguments || '{}');
        const result = await executeOrchestratorTool(toolCall.function.name, args, supabase);
        
        try {
          const parsed = JSON.parse(result);
          if (parsed.agent) agentsUsed.push(parsed.agent);
          totalToolCalls += parsed.tool_calls_made || 0;
        } catch {}

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
          tools: ORCHESTRATOR_TOOLS,
          tool_choice: 'auto',
          max_completion_tokens: 3000,
        }),
      });

      data = await response.json();
      assistantMessage = data.choices[0].message;
    }

    console.log(`Agent River response - agents used: ${agentsUsed.join(', ')}, tool calls: ${totalToolCalls}`);

    return new Response(JSON.stringify({
      response: assistantMessage.content,
      agents_used: [...new Set(agentsUsed)],
      tool_calls: totalToolCalls
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Agent River error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
