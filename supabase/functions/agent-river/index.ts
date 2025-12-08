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
2. **finance_agent**: AR/AP aging, cash position, journal entries, financial metrics
3. **banking_agent**: Bank accounts, transactions, reconciliation, matching rules, statement imports, positive pay
4. **o2c_agent**: Order-to-Cash - Quotations, sales orders, shipments, customer invoices, revenue tracking
5. **p2p_agent**: Procure-to-Pay - Purchase requisitions, purchase orders, goods receipts, vendor bills, payment runs
6. **inventory_agent**: Stock levels, warehouses, products, transfers, cycle counts, batch/serial tracking
7. **production_agent**: BOMs, production orders, work centers, MRP, capacity planning
8. **controlling_agent**: Cost centers, internal orders, budget variance, CO documents, fixed assets
9. **service_agent**: Service contracts, warranties, service calls, field visits

When a user asks a question:
1. Analyze which agent(s) can best answer the question
2. Call the appropriate agent tool(s) with a clear, specific task
3. Synthesize the results into a cohesive response

Route queries appropriately:
- Quotations, sales orders, shipments, customer invoices → o2c_agent
- Purchase requisitions, POs, goods receipts, vendor bills, payment runs → p2p_agent
- General AR/AP summaries, GL, key metrics → finance_agent
- Bank accounts, transactions, reconciliation, matching, positive pay → banking_agent

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
    description: "Handles general finance queries: AR/AP aging summaries, journal entries, general financial metrics",
    prompt: `You are a finance specialist. Analyze financial data and provide insights. Use tools to query AR aging, AP summary, and GL data.`,
    tools: [
      { type: "function", function: { name: "get_ar_aging", description: "Get AR aging summary with buckets", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_ap_summary", description: "Get AP summary", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_journal_entries", description: "Get journal entries", parameters: { type: "object", properties: { status: { type: "string", enum: ["draft", "posted", "reversed"] } }, required: [] } } },
      { type: "function", function: { name: "get_key_metrics", description: "Get key financial metrics", parameters: { type: "object", properties: {}, required: [] } } },
    ]
  },
  banking_agent: {
    description: "Handles banking queries: bank accounts, transactions, reconciliation status, matching rules, statement imports, positive pay checks",
    prompt: `You are a banking and reconciliation specialist. Analyze bank accounts, transactions, and reconciliation data. Use tools to query banking information and provide insights on reconciliation status.`,
    tools: [
      { type: "function", function: { name: "get_bank_accounts", description: "Get bank accounts with balances", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_bank_transactions", description: "Get bank transactions", parameters: { type: "object", properties: { status: { type: "string", enum: ["pending", "matched", "reconciled"] }, limit: { type: "number" } }, required: [] } } },
      { type: "function", function: { name: "get_reconciliation_summary", description: "Get reconciliation status summary", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_matching_rules", description: "Get auto-matching rules", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_statement_imports", description: "Get bank statement import history", parameters: { type: "object", properties: { limit: { type: "number" } }, required: [] } } },
      { type: "function", function: { name: "get_positive_pay_checks", description: "Get positive pay checks", parameters: { type: "object", properties: { status: { type: "string", enum: ["issued", "presented", "paid", "void", "exception"] } }, required: [] } } },
      { type: "function", function: { name: "get_cash_position", description: "Get cash position across bank accounts", parameters: { type: "object", properties: {}, required: [] } } },
    ]
  },
  o2c_agent: {
    description: "Handles Order-to-Cash: quotations, sales orders, shipments, customer invoices, revenue tracking",
    prompt: `You are an Order-to-Cash specialist. Manage the full revenue cycle from quotations to cash collection. Use tools to query quotations, sales orders, shipments, and invoices.`,
    tools: [
      { type: "function", function: { name: "get_quotations", description: "Get quotations", parameters: { type: "object", properties: { status: { type: "string", enum: ["draft", "sent", "accepted", "rejected", "expired", "converted"] }, customer_name: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_quotation_summary", description: "Get quotation pipeline summary", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_sales_orders", description: "Get sales orders", parameters: { type: "object", properties: { status: { type: "string", enum: ["draft", "approved", "shipped", "invoiced", "completed", "cancelled"] }, customer_name: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_shipments", description: "Get shipments", parameters: { type: "object", properties: { so_number: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_invoices", description: "Get customer invoices", parameters: { type: "object", properties: { status: { type: "string", enum: ["draft", "sent", "paid", "overdue"] }, customer_name: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_o2c_cycle_summary", description: "Get O2C cycle metrics", parameters: { type: "object", properties: {}, required: [] } } },
    ]
  },
  p2p_agent: {
    description: "Handles Procure-to-Pay: purchase requisitions, purchase orders, goods receipts, vendor bills, payment runs, 3-way matching",
    prompt: `You are a Procure-to-Pay specialist. Manage the full procurement cycle from requisitions to payments. Use tools to query requisitions, POs, goods receipts, bills, and payment runs.`,
    tools: [
      { type: "function", function: { name: "get_purchase_requisitions", description: "Get purchase requisitions", parameters: { type: "object", properties: { status: { type: "string", enum: ["draft", "pending_approval", "approved", "rejected", "converted", "cancelled"] } }, required: [] } } },
      { type: "function", function: { name: "get_purchase_orders", description: "Get purchase orders", parameters: { type: "object", properties: { status: { type: "string", enum: ["draft", "pending_approval", "approved", "partially_received", "received", "cancelled"] }, vendor_name: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_goods_receipts", description: "Get goods receipts", parameters: { type: "object", properties: { po_number: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_bills", description: "Get vendor bills", parameters: { type: "object", properties: { status: { type: "string", enum: ["draft", "pending", "paid", "overdue"] }, vendor_name: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_payment_runs", description: "Get payment runs", parameters: { type: "object", properties: { status: { type: "string", enum: ["draft", "pending_approval", "approved", "processing", "completed", "failed"] } }, required: [] } } },
      { type: "function", function: { name: "get_p2p_cycle_summary", description: "Get P2P cycle metrics", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_vendors", description: "Get vendors", parameters: { type: "object", properties: { search: { type: "string" } }, required: [] } } },
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
      description: "Delegate general finance queries: AR/AP aging summaries, journal entries, key metrics",
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
      name: "call_banking_agent",
      description: "Delegate banking queries: bank accounts, transactions, reconciliation, matching rules, statement imports, positive pay",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The specific task or question for the Banking agent" }
        },
        required: ["task"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "call_o2c_agent",
      description: "Delegate Order-to-Cash queries: quotations, sales orders, shipments, customer invoices, revenue tracking",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The specific task or question for the O2C agent" }
        },
        required: ["task"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "call_p2p_agent",
      description: "Delegate Procure-to-Pay queries: purchase requisitions, purchase orders, goods receipts, vendor bills, payment runs",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The specific task or question for the P2P agent" }
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
        let query = supabase.from('bank_transactions').select('*, bank_accounts(name), matched_invoice:invoices(invoice_number), matched_bill:bills(bill_number)');
        if (args.status) query = query.eq('status', args.status);
        const limit = args.limit || 20;
        const { data } = await query.order('transaction_date', { ascending: false }).limit(limit);
        return JSON.stringify(data || []);
      }

      // Banking Tools
      case 'get_bank_accounts': {
        const { data: accounts } = await supabase.from('bank_accounts').select('*').eq('is_active', true).order('name');
        return JSON.stringify({
          accounts: accounts?.map((a: any) => ({
            id: a.id,
            name: a.name,
            bank_name: a.bank_name,
            account_number: a.account_number ? '****' + a.account_number.slice(-4) : null,
            balance: a.current_balance,
            currency: a.currency
          })) || [],
          total_balance: accounts?.reduce((s: number, a: any) => s + (a.current_balance || 0), 0) || 0,
          account_count: accounts?.length || 0
        });
      }

      case 'get_reconciliation_summary': {
        const { data: transactions } = await supabase.from('bank_transactions').select('status, amount');
        const pending = transactions?.filter((t: any) => t.status === 'pending') || [];
        const matched = transactions?.filter((t: any) => t.status === 'matched') || [];
        const reconciled = transactions?.filter((t: any) => t.status === 'reconciled') || [];
        
        return JSON.stringify({
          total_transactions: transactions?.length || 0,
          pending: {
            count: pending.length,
            total_amount: pending.reduce((s: number, t: any) => s + Math.abs(t.amount || 0), 0)
          },
          matched: {
            count: matched.length,
            total_amount: matched.reduce((s: number, t: any) => s + Math.abs(t.amount || 0), 0)
          },
          reconciled: {
            count: reconciled.length,
            total_amount: reconciled.reduce((s: number, t: any) => s + Math.abs(t.amount || 0), 0)
          },
          reconciliation_rate: transactions?.length ? ((reconciled.length / transactions.length) * 100).toFixed(1) + '%' : '0%'
        });
      }

      case 'get_matching_rules': {
        const { data: rules } = await supabase.from('matching_rules').select('*, target_account:accounts(name, code)').eq('is_active', true).order('priority');
        return JSON.stringify({
          rules: rules?.map((r: any) => ({
            id: r.id,
            name: r.name,
            rule_type: r.rule_type,
            field_to_match: r.field_to_match,
            pattern: r.match_pattern,
            target_account: r.target_account ? `${r.target_account.code} - ${r.target_account.name}` : null,
            auto_reconcile: r.auto_reconcile,
            match_count: r.match_count,
            priority: r.priority
          })) || [],
          total_rules: rules?.length || 0
        });
      }

      case 'get_statement_imports': {
        const limit = args.limit || 20;
        const { data: imports } = await supabase.from('bank_statement_imports').select('*, bank_account:bank_accounts(name)').order('import_date', { ascending: false }).limit(limit);
        return JSON.stringify({
          imports: imports?.map((i: any) => ({
            id: i.id,
            file_name: i.file_name,
            file_type: i.file_type,
            bank_account: i.bank_account?.name,
            import_date: i.import_date,
            status: i.status,
            total_transactions: i.total_transactions,
            imported_transactions: i.imported_transactions,
            duplicate_transactions: i.duplicate_transactions
          })) || [],
          total_imports: imports?.length || 0
        });
      }

      case 'get_positive_pay_checks': {
        let query = supabase.from('positive_pay_checks').select('*, bank_account:bank_accounts(name), bill:bills(bill_number, vendor:vendors(name))');
        if (args.status) query = query.eq('status', args.status);
        const { data: checks } = await query.order('issue_date', { ascending: false }).limit(50);
        
        const statusCounts: Record<string, number> = {};
        checks?.forEach((c: any) => {
          statusCounts[c.status] = (statusCounts[c.status] || 0) + 1;
        });
        
        return JSON.stringify({
          checks: checks?.map((c: any) => ({
            id: c.id,
            check_number: c.check_number,
            payee_name: c.payee_name,
            amount: c.amount,
            issue_date: c.issue_date,
            status: c.status,
            bank_account: c.bank_account?.name,
            vendor: c.bill?.vendor?.name
          })) || [],
          total_checks: checks?.length || 0,
          by_status: statusCounts
        });
      }

      case 'get_key_metrics': {
        const { data: invoices } = await supabase.from('invoices').select('total, amount_paid, issue_date').neq('status', 'paid');
        const { data: bills } = await supabase.from('bills').select('total, amount_paid');
        const { data: bankAccounts } = await supabase.from('bank_accounts').select('current_balance').eq('is_active', true);
        
        const totalAR = invoices?.reduce((s: number, i: any) => s + (i.total - i.amount_paid), 0) || 0;
        const totalAP = bills?.reduce((s: number, b: any) => s + (b.total - b.amount_paid), 0) || 0;
        const totalCash = bankAccounts?.reduce((s: number, a: any) => s + (a.current_balance || 0), 0) || 0;
        
        return JSON.stringify({
          total_receivables: totalAR,
          total_payables: totalAP,
          total_cash: totalCash,
          working_capital: totalCash + totalAR - totalAP,
          invoice_count: invoices?.length || 0,
          bill_count: bills?.length || 0
        });
      }

      // O2C Tools
      case 'get_quotations': {
        let query = supabase.from('quotations').select('*, customers(name)');
        if (args.status) query = query.eq('status', args.status);
        if (args.customer_name) query = query.ilike('customers.name', `%${args.customer_name}%`);
        const { data } = await query.order('created_at', { ascending: false }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_quotation_summary': {
        const { data: quotations } = await supabase.from('quotations').select('status, total');
        const statuses = ['draft', 'sent', 'accepted', 'rejected', 'expired', 'converted'];
        const summary = statuses.map(status => ({
          status,
          count: quotations?.filter((q: any) => q.status === status).length || 0,
          total_value: quotations?.filter((q: any) => q.status === status).reduce((s: number, q: any) => s + (q.total || 0), 0) || 0
        }));
        return JSON.stringify({
          total_quotations: quotations?.length || 0,
          by_status: summary
        });
      }

      case 'get_sales_orders': {
        let query = supabase.from('sales_orders').select('*, customers(name)');
        if (args.status) query = query.eq('status', args.status);
        if (args.customer_name) query = query.ilike('customers.name', `%${args.customer_name}%`);
        const { data } = await query.order('created_at', { ascending: false }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_shipments': {
        let query = supabase.from('shipments').select('*, sales_orders(order_number, customers(name))');
        if (args.so_number) query = query.ilike('sales_orders.order_number', `%${args.so_number}%`);
        const { data } = await query.order('created_at', { ascending: false }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_o2c_cycle_summary': {
        const { data: quotations } = await supabase.from('quotations').select('status');
        const { data: salesOrders } = await supabase.from('sales_orders').select('status');
        const { data: shipments } = await supabase.from('shipments').select('status');
        const { data: invoices } = await supabase.from('invoices').select('status, total, amount_paid');
        
        return JSON.stringify({
          quotations: {
            total: quotations?.length || 0,
            pending: quotations?.filter((q: any) => ['draft', 'sent'].includes(q.status)).length || 0,
            converted: quotations?.filter((q: any) => q.status === 'converted').length || 0
          },
          sales_orders: {
            total: salesOrders?.length || 0,
            open: salesOrders?.filter((s: any) => !['completed', 'cancelled'].includes(s.status)).length || 0
          },
          shipments: {
            total: shipments?.length || 0,
            pending: shipments?.filter((s: any) => s.status === 'pending').length || 0
          },
          invoices: {
            total: invoices?.length || 0,
            unpaid: invoices?.filter((i: any) => i.status !== 'paid').length || 0,
            total_outstanding: invoices?.filter((i: any) => i.status !== 'paid').reduce((s: number, i: any) => s + (i.total - i.amount_paid), 0) || 0
          }
        });
      }

      // P2P Tools
      case 'get_purchase_requisitions': {
        let query = supabase.from('purchase_requisitions').select('*');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.order('created_at', { ascending: false }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_purchase_orders': {
        let query = supabase.from('purchase_orders').select('*, vendors(name)');
        if (args.status) query = query.eq('status', args.status);
        if (args.vendor_name) query = query.ilike('vendors.name', `%${args.vendor_name}%`);
        const { data } = await query.order('created_at', { ascending: false }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_goods_receipts': {
        let query = supabase.from('goods_receipts').select('*, purchase_orders(po_number, vendors(name))');
        if (args.po_number) query = query.ilike('purchase_orders.po_number', `%${args.po_number}%`);
        const { data } = await query.order('created_at', { ascending: false }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_payment_runs': {
        let query = supabase.from('payment_runs').select('*');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.order('created_at', { ascending: false }).limit(20);
        return JSON.stringify(data || []);
      }

      case 'get_p2p_cycle_summary': {
        const { data: requisitions } = await supabase.from('purchase_requisitions').select('status');
        const { data: purchaseOrders } = await supabase.from('purchase_orders').select('status');
        const { data: goodsReceipts } = await supabase.from('goods_receipts').select('id');
        const { data: bills } = await supabase.from('bills').select('status, total, amount_paid');
        
        return JSON.stringify({
          requisitions: {
            total: requisitions?.length || 0,
            pending_approval: requisitions?.filter((r: any) => r.status === 'pending_approval').length || 0
          },
          purchase_orders: {
            total: purchaseOrders?.length || 0,
            open: purchaseOrders?.filter((p: any) => !['received', 'cancelled'].includes(p.status)).length || 0
          },
          goods_receipts: {
            total: goodsReceipts?.length || 0
          },
          bills: {
            total: bills?.length || 0,
            unpaid: bills?.filter((b: any) => b.status !== 'paid').length || 0,
            total_outstanding: bills?.filter((b: any) => b.status !== 'paid').reduce((s: number, b: any) => s + (b.total - b.amount_paid), 0) || 0
          }
        });
      }

      case 'get_vendors': {
        let query = supabase.from('vendors').select('*');
        if (args.search) query = query.ilike('name', `%${args.search}%`);
        const { data } = await query.limit(20);
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
    'call_banking_agent': 'banking_agent',
    'call_o2c_agent': 'o2c_agent',
    'call_p2p_agent': 'p2p_agent',
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
    const { messages, org_id } = await req.json();
    console.log('Agent River request - messages:', messages.length, 'org_id:', org_id);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Try to get user's OpenAI key from their organization
    let apiKey = openAIApiKey;
    if (org_id) {
      const { data: orgData } = await supabase
        .from('organizations')
        .select('openai_api_key')
        .eq('id', org_id)
        .single();
      
      if (orgData?.openai_api_key) {
        apiKey = orgData.openai_api_key;
        console.log('Using user-provided OpenAI API key');
      }
    }

    if (!apiKey) {
      throw new Error('OPENAI_API_KEY not configured. Please add your OpenAI API key in Settings > API Keys.');
    }

    const apiMessages = [
      { role: 'system', content: AGENT_RIVER_SYSTEM },
      ...messages
    ];

    // Initial orchestrator call
    let response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
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
          'Authorization': `Bearer ${apiKey}`,
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
