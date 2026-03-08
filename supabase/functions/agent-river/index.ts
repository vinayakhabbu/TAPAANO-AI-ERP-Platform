import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { AgentRunLogger } from "../_shared/agentRunLogger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
10. **approvals_agent**: Approve/reject purchase orders, payment runs, purchase requisitions via natural language
11. **hr_payroll_agent**: Employees, departments, positions, payroll runs, salary analysis, headcount, deductions
12. **tax_agent**: Tax codes, tax rates, jurisdictions, tax transactions, filing periods, tax liability analysis
13. **currency_agent**: Exchange rates, currency revaluations, unrealized/realized gains/losses, FX exposure

When a user asks a question:
1. Analyze which agent(s) can best answer the question
2. Call the appropriate agent tool(s) with a clear, specific task
3. Synthesize the results into a cohesive response

Route queries appropriately:
- Quotations, sales orders, shipments, customer invoices → o2c_agent
- Purchase requisitions, POs, goods receipts, vendor bills, payment runs → p2p_agent
- General AR/AP summaries, GL, key metrics → finance_agent
- Bank accounts, transactions, reconciliation, matching, positive pay → banking_agent
- Approval requests like "approve PO-001" or "reject payment run" → approvals_agent
- Employees, departments, positions, salaries, payroll runs, headcount → hr_payroll_agent
- Tax codes, rates, jurisdictions, tax liability, filings → tax_agent
- Exchange rates, currency gains/losses, FX revaluation → currency_agent

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
  },
  approvals_agent: {
    description: "Handles approval actions: approve/reject purchase orders, payment runs, purchase requisitions via natural language commands",
    prompt: `You are an approvals specialist. You can approve or reject purchase orders, payment runs, and purchase requisitions. 
When asked to approve or reject, first find the document by number/ID, then execute the action.
Always confirm what action you're taking and provide a summary of the document.
For bulk approvals, process each one and report results.`,
    tools: [
      { type: "function", function: { name: "find_purchase_order", description: "Find a purchase order by number or ID", parameters: { type: "object", properties: { po_number: { type: "string" }, id: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "approve_purchase_order", description: "Approve a purchase order", parameters: { type: "object", properties: { id: { type: "string", description: "PO ID" }, rationale: { type: "string", description: "Reason for approval" } }, required: ["id"] } } },
      { type: "function", function: { name: "reject_purchase_order", description: "Reject a purchase order", parameters: { type: "object", properties: { id: { type: "string", description: "PO ID" }, rationale: { type: "string", description: "Reason for rejection" } }, required: ["id", "rationale"] } } },
      { type: "function", function: { name: "find_payment_run", description: "Find a payment run by number or ID", parameters: { type: "object", properties: { run_number: { type: "string" }, id: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "approve_payment_run", description: "Approve a payment run", parameters: { type: "object", properties: { id: { type: "string", description: "Payment run ID" }, rationale: { type: "string", description: "Reason for approval" } }, required: ["id"] } } },
      { type: "function", function: { name: "reject_payment_run", description: "Reject a payment run", parameters: { type: "object", properties: { id: { type: "string", description: "Payment run ID" }, rationale: { type: "string", description: "Reason for rejection" } }, required: ["id", "rationale"] } } },
      { type: "function", function: { name: "find_purchase_requisition", description: "Find a purchase requisition by number or ID", parameters: { type: "object", properties: { pr_number: { type: "string" }, id: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "approve_purchase_requisition", description: "Approve a purchase requisition", parameters: { type: "object", properties: { id: { type: "string", description: "PR ID" }, rationale: { type: "string", description: "Reason for approval" } }, required: ["id"] } } },
      { type: "function", function: { name: "reject_purchase_requisition", description: "Reject a purchase requisition", parameters: { type: "object", properties: { id: { type: "string", description: "PR ID" }, rationale: { type: "string", description: "Reason for rejection" } }, required: ["id", "rationale"] } } },
      { type: "function", function: { name: "get_pending_approvals", description: "Get all pending approvals across POs, payment runs, and PRs", parameters: { type: "object", properties: { type: { type: "string", enum: ["all", "purchase_order", "payment_run", "purchase_requisition"] } }, required: [] } } },
      { type: "function", function: { name: "bulk_approve", description: "Approve multiple documents at once", parameters: { type: "object", properties: { type: { type: "string", enum: ["purchase_order", "payment_run", "purchase_requisition"] }, ids: { type: "array", items: { type: "string" } }, rationale: { type: "string" } }, required: ["type", "ids"] } } },
    ]
  },
  hr_payroll_agent: {
    description: "Handles HR and Payroll queries: employees, departments, positions, payroll runs, salary analysis, headcount metrics",
    prompt: `You are an HR and Payroll specialist. Analyze employee data, organizational structure, and payroll information. Provide insights on headcount, compensation, and workforce metrics.`,
    tools: [
      { type: "function", function: { name: "get_employees", description: "Get employees with filters", parameters: { type: "object", properties: { status: { type: "string", enum: ["active", "on_leave", "terminated", "suspended"] }, department_id: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_employee_summary", description: "Get employee headcount summary by department and status", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_departments", description: "Get departments with employee counts", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_positions", description: "Get positions with salary ranges", parameters: { type: "object", properties: { department_id: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_payroll_summary", description: "Get payroll cost summary", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_payroll_runs", description: "Get payroll runs", parameters: { type: "object", properties: { status: { type: "string", enum: ["draft", "approved", "posted", "paid"] }, limit: { type: "number" } }, required: [] } } },
      { type: "function", function: { name: "get_payroll_periods", description: "Get payroll periods", parameters: { type: "object", properties: { status: { type: "string", enum: ["open", "closed"] } }, required: [] } } },
      { type: "function", function: { name: "get_salary_analysis", description: "Analyze salary distribution by department/position", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_deduction_types", description: "Get configured deduction types", parameters: { type: "object", properties: {}, required: [] } } },
    ]
  },
  tax_agent: {
    description: "Handles Tax Management queries: tax codes, rates, jurisdictions, tax transactions, filing periods, tax liability analysis",
    prompt: `You are a Tax specialist. Analyze tax data, compliance status, and provide insights on tax liability, filings, and rates. Help ensure tax compliance.`,
    tools: [
      { type: "function", function: { name: "get_tax_codes", description: "Get tax codes", parameters: { type: "object", properties: { tax_type: { type: "string", enum: ["sales", "purchase", "vat", "gst", "withholding"] } }, required: [] } } },
      { type: "function", function: { name: "get_tax_rates", description: "Get tax rates by code or jurisdiction", parameters: { type: "object", properties: { tax_code_id: { type: "string" }, jurisdiction_id: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_tax_jurisdictions", description: "Get tax jurisdictions", parameters: { type: "object", properties: { country_code: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_tax_transactions", description: "Get tax transactions", parameters: { type: "object", properties: { status: { type: "string", enum: ["pending", "filed", "paid"] }, period: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_tax_summary", description: "Get tax liability summary (sales vs purchase tax, net payable)", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_filing_periods", description: "Get tax filing periods and their status", parameters: { type: "object", properties: { status: { type: "string", enum: ["open", "filed", "paid", "overdue"] } }, required: [] } } },
      { type: "function", function: { name: "get_overdue_filings", description: "Get overdue tax filings that need attention", parameters: { type: "object", properties: {}, required: [] } } },
    ]
  },
  currency_agent: {
    description: "Handles Multi-Currency queries: exchange rates, currency revaluations, unrealized/realized gains and losses, FX exposure analysis",
    prompt: `You are a Multi-Currency and FX specialist. Analyze exchange rates, currency exposures, and gains/losses from foreign currency transactions. Help manage FX risk.`,
    tools: [
      { type: "function", function: { name: "get_exchange_rates", description: "Get exchange rates", parameters: { type: "object", properties: { from_currency: { type: "string" }, to_currency: { type: "string" }, rate_type: { type: "string", enum: ["spot", "average", "closing"] } }, required: [] } } },
      { type: "function", function: { name: "get_currency_revaluations", description: "Get currency revaluations", parameters: { type: "object", properties: { gain_loss_type: { type: "string", enum: ["realized", "unrealized"] }, currency: { type: "string" } }, required: [] } } },
      { type: "function", function: { name: "get_fx_summary", description: "Get FX gains/losses summary", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_fx_exposure", description: "Get foreign currency exposure by currency", parameters: { type: "object", properties: {}, required: [] } } },
      { type: "function", function: { name: "get_latest_rates", description: "Get latest exchange rates for all configured currency pairs", parameters: { type: "object", properties: {}, required: [] } } },
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
  },
  {
    type: "function",
    function: {
      name: "call_approvals_agent",
      description: "Delegate approval actions: approve/reject purchase orders, payment runs, purchase requisitions. Use for commands like 'approve PO-001' or 'reject all pending payment runs'",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The specific approval action for the Approvals agent" }
        },
        required: ["task"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "call_hr_payroll_agent",
      description: "Delegate HR and Payroll queries: employees, departments, positions, payroll runs, salary analysis, headcount metrics",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The specific task or question for the HR/Payroll agent" }
        },
        required: ["task"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "call_tax_agent",
      description: "Delegate Tax Management queries: tax codes, rates, jurisdictions, tax liability, filings, compliance",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The specific task or question for the Tax agent" }
        },
        required: ["task"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "call_currency_agent",
      description: "Delegate Multi-Currency queries: exchange rates, FX gains/losses, currency revaluations, exposure analysis",
      parameters: {
        type: "object",
        properties: {
          task: { type: "string", description: "The specific task or question for the Currency agent" }
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

      // Approvals Agent Tools
      case 'find_purchase_order': {
        let query = supabase.from('purchase_orders').select('*, vendors(name)');
        if (args.po_number) query = query.eq('po_number', args.po_number);
        if (args.id) query = query.eq('id', args.id);
        const { data } = await query.limit(1).single();
        if (!data) return JSON.stringify({ error: 'Purchase order not found' });
        return JSON.stringify({
          id: data.id,
          po_number: data.po_number,
          vendor: data.vendors?.name,
          total: data.total,
          status: data.status,
          created_at: data.created_at
        });
      }

      case 'approve_purchase_order': {
        if (!args.id) return JSON.stringify({ error: 'PO ID is required' });
        
        const { data: po } = await supabase.from('purchase_orders').select('*, vendors(name)').eq('id', args.id).single();
        if (!po) return JSON.stringify({ error: 'Purchase order not found' });
        if (po.status !== 'pending_approval') return JSON.stringify({ error: `Cannot approve PO in status: ${po.status}. Must be pending_approval.` });
        
        const { error } = await supabase.from('purchase_orders').update({ 
          status: 'approved', 
          approved_at: new Date().toISOString() 
        }).eq('id', args.id);
        
        if (error) return JSON.stringify({ error: error.message });
        
        // Log decision trace
        await supabase.from('decision_traces').insert({
          org_id: po.org_id,
          decision_type: 'po_approval',
          source_type: 'purchase_order',
          source_id: args.id,
          approval_status: 'approved',
          approval_channel: 'chat',
          input_snapshot: { po_number: po.po_number, vendor: po.vendors?.name, total: po.total },
          rationale_text: args.rationale || 'Approved via Agent River chat'
        });
        
        return JSON.stringify({ 
          success: true, 
          message: `Approved PO ${po.po_number} for ${po.vendors?.name} ($${po.total.toLocaleString()})`,
          po_number: po.po_number
        });
      }

      case 'reject_purchase_order': {
        if (!args.id) return JSON.stringify({ error: 'PO ID is required' });
        if (!args.rationale) return JSON.stringify({ error: 'Rationale is required for rejection' });
        
        const { data: po } = await supabase.from('purchase_orders').select('*, vendors(name)').eq('id', args.id).single();
        if (!po) return JSON.stringify({ error: 'Purchase order not found' });
        if (po.status !== 'pending_approval') return JSON.stringify({ error: `Cannot reject PO in status: ${po.status}. Must be pending_approval.` });
        
        const { error } = await supabase.from('purchase_orders').update({ status: 'draft' }).eq('id', args.id);
        if (error) return JSON.stringify({ error: error.message });
        
        await supabase.from('decision_traces').insert({
          org_id: po.org_id,
          decision_type: 'po_rejection',
          source_type: 'purchase_order',
          source_id: args.id,
          approval_status: 'rejected',
          approval_channel: 'chat',
          input_snapshot: { po_number: po.po_number, vendor: po.vendors?.name, total: po.total },
          rationale_text: args.rationale
        });
        
        return JSON.stringify({ 
          success: true, 
          message: `Rejected PO ${po.po_number}. Reason: ${args.rationale}`,
          po_number: po.po_number
        });
      }

      case 'find_payment_run': {
        let query = supabase.from('payment_runs').select('*');
        if (args.run_number) query = query.eq('run_number', args.run_number);
        if (args.id) query = query.eq('id', args.id);
        const { data } = await query.limit(1).single();
        if (!data) return JSON.stringify({ error: 'Payment run not found' });
        return JSON.stringify({
          id: data.id,
          run_number: data.run_number,
          total_amount: data.total_amount,
          payment_method: data.payment_method,
          status: data.status,
          created_at: data.created_at
        });
      }

      case 'approve_payment_run': {
        if (!args.id) return JSON.stringify({ error: 'Payment run ID is required' });
        
        const { data: run } = await supabase.from('payment_runs').select('*').eq('id', args.id).single();
        if (!run) return JSON.stringify({ error: 'Payment run not found' });
        if (run.status !== 'pending_approval') return JSON.stringify({ error: `Cannot approve run in status: ${run.status}. Must be pending_approval.` });
        
        const { error } = await supabase.from('payment_runs').update({ 
          status: 'approved', 
          approved_at: new Date().toISOString() 
        }).eq('id', args.id);
        
        if (error) return JSON.stringify({ error: error.message });
        
        await supabase.from('decision_traces').insert({
          org_id: run.org_id,
          decision_type: 'payment_approval',
          source_type: 'payment_run',
          source_id: args.id,
          approval_status: 'approved',
          approval_channel: 'chat',
          input_snapshot: { run_number: run.run_number, total_amount: run.total_amount, payment_method: run.payment_method },
          rationale_text: args.rationale || 'Approved via Agent River chat'
        });
        
        return JSON.stringify({ 
          success: true, 
          message: `Approved payment run ${run.run_number} for $${run.total_amount.toLocaleString()}`,
          run_number: run.run_number
        });
      }

      case 'reject_payment_run': {
        if (!args.id) return JSON.stringify({ error: 'Payment run ID is required' });
        if (!args.rationale) return JSON.stringify({ error: 'Rationale is required for rejection' });
        
        const { data: run } = await supabase.from('payment_runs').select('*').eq('id', args.id).single();
        if (!run) return JSON.stringify({ error: 'Payment run not found' });
        if (run.status !== 'pending_approval') return JSON.stringify({ error: `Cannot reject run in status: ${run.status}. Must be pending_approval.` });
        
        const { error } = await supabase.from('payment_runs').update({ status: 'draft' }).eq('id', args.id);
        if (error) return JSON.stringify({ error: error.message });
        
        await supabase.from('decision_traces').insert({
          org_id: run.org_id,
          decision_type: 'payment_rejection',
          source_type: 'payment_run',
          source_id: args.id,
          approval_status: 'rejected',
          approval_channel: 'chat',
          input_snapshot: { run_number: run.run_number, total_amount: run.total_amount },
          rationale_text: args.rationale
        });
        
        return JSON.stringify({ 
          success: true, 
          message: `Rejected payment run ${run.run_number}. Reason: ${args.rationale}`,
          run_number: run.run_number
        });
      }

      case 'find_purchase_requisition': {
        let query = supabase.from('purchase_requisitions').select('*');
        if (args.pr_number) query = query.eq('pr_number', args.pr_number);
        if (args.id) query = query.eq('id', args.id);
        const { data } = await query.limit(1).single();
        if (!data) return JSON.stringify({ error: 'Purchase requisition not found' });
        return JSON.stringify({
          id: data.id,
          pr_number: data.pr_number,
          total_amount: data.total_amount,
          status: data.status,
          created_at: data.created_at
        });
      }

      case 'approve_purchase_requisition': {
        if (!args.id) return JSON.stringify({ error: 'PR ID is required' });
        
        const { data: pr } = await supabase.from('purchase_requisitions').select('*').eq('id', args.id).single();
        if (!pr) return JSON.stringify({ error: 'Purchase requisition not found' });
        if (pr.status !== 'pending_approval') return JSON.stringify({ error: `Cannot approve PR in status: ${pr.status}. Must be pending_approval.` });
        
        const { error } = await supabase.from('purchase_requisitions').update({ 
          status: 'approved', 
          approved_at: new Date().toISOString() 
        }).eq('id', args.id);
        
        if (error) return JSON.stringify({ error: error.message });
        
        await supabase.from('decision_traces').insert({
          org_id: pr.org_id,
          decision_type: 'pr_approval',
          source_type: 'purchase_requisition',
          source_id: args.id,
          approval_status: 'approved',
          approval_channel: 'chat',
          input_snapshot: { pr_number: pr.pr_number, total_amount: pr.total_amount },
          rationale_text: args.rationale || 'Approved via Agent River chat'
        });
        
        return JSON.stringify({ 
          success: true, 
          message: `Approved PR ${pr.pr_number} ($${pr.total_amount?.toLocaleString() || 0})`,
          pr_number: pr.pr_number
        });
      }

      case 'reject_purchase_requisition': {
        if (!args.id) return JSON.stringify({ error: 'PR ID is required' });
        if (!args.rationale) return JSON.stringify({ error: 'Rationale is required for rejection' });
        
        const { data: pr } = await supabase.from('purchase_requisitions').select('*').eq('id', args.id).single();
        if (!pr) return JSON.stringify({ error: 'Purchase requisition not found' });
        if (pr.status !== 'pending_approval') return JSON.stringify({ error: `Cannot reject PR in status: ${pr.status}. Must be pending_approval.` });
        
        const { error } = await supabase.from('purchase_requisitions').update({ status: 'draft' }).eq('id', args.id);
        if (error) return JSON.stringify({ error: error.message });
        
        await supabase.from('decision_traces').insert({
          org_id: pr.org_id,
          decision_type: 'pr_rejection',
          source_type: 'purchase_requisition',
          source_id: args.id,
          approval_status: 'rejected',
          approval_channel: 'chat',
          input_snapshot: { pr_number: pr.pr_number, total_amount: pr.total_amount },
          rationale_text: args.rationale
        });
        
        return JSON.stringify({ 
          success: true, 
          message: `Rejected PR ${pr.pr_number}. Reason: ${args.rationale}`,
          pr_number: pr.pr_number
        });
      }

      case 'get_pending_approvals': {
        const type = args.type || 'all';
        const result: any = {};
        
        if (type === 'all' || type === 'purchase_order') {
          const { data: pos } = await supabase.from('purchase_orders').select('id, po_number, total, vendors(name), created_at').eq('status', 'pending_approval');
          result.purchase_orders = pos?.map((po: any) => ({
            id: po.id, po_number: po.po_number, vendor: po.vendors?.name, total: po.total, created_at: po.created_at
          })) || [];
        }
        
        if (type === 'all' || type === 'payment_run') {
          const { data: runs } = await supabase.from('payment_runs').select('id, run_number, total_amount, payment_method, created_at').eq('status', 'pending_approval');
          result.payment_runs = runs?.map((r: any) => ({
            id: r.id, run_number: r.run_number, total_amount: r.total_amount, payment_method: r.payment_method, created_at: r.created_at
          })) || [];
        }
        
        if (type === 'all' || type === 'purchase_requisition') {
          const { data: prs } = await supabase.from('purchase_requisitions').select('id, pr_number, total_amount, created_at').eq('status', 'pending_approval');
          result.purchase_requisitions = prs?.map((pr: any) => ({
            id: pr.id, pr_number: pr.pr_number, total_amount: pr.total_amount, created_at: pr.created_at
          })) || [];
        }
        
        return JSON.stringify(result);
      }

      case 'bulk_approve': {
        if (!args.type || !args.ids || !args.ids.length) {
          return JSON.stringify({ error: 'Type and IDs array are required' });
        }
        
        const results: any[] = [];
        
        for (const id of args.ids) {
          let success = false;
          let message = '';
          
          switch (args.type) {
            case 'purchase_order': {
              const { data: po } = await supabase.from('purchase_orders').select('*, vendors(name)').eq('id', id).single();
              if (!po) { message = `PO ${id} not found`; break; }
              if (po.status !== 'pending_approval') { message = `PO ${po.po_number} not pending approval`; break; }
              
              const { error } = await supabase.from('purchase_orders').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', id);
              if (error) { message = error.message; break; }
              
              await supabase.from('decision_traces').insert({
                org_id: po.org_id,
                decision_type: 'po_approval',
                source_type: 'purchase_order',
                source_id: id,
                approval_status: 'approved',
                approval_channel: 'chat_bulk',
                input_snapshot: { po_number: po.po_number, vendor: po.vendors?.name, total: po.total },
                rationale_text: args.rationale || 'Bulk approved via Agent River chat'
              });
              
              success = true;
              message = `Approved PO ${po.po_number}`;
              break;
            }
            case 'payment_run': {
              const { data: run } = await supabase.from('payment_runs').select('*').eq('id', id).single();
              if (!run) { message = `Payment run ${id} not found`; break; }
              if (run.status !== 'pending_approval') { message = `Run ${run.run_number} not pending approval`; break; }
              
              const { error } = await supabase.from('payment_runs').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', id);
              if (error) { message = error.message; break; }
              
              await supabase.from('decision_traces').insert({
                org_id: run.org_id,
                decision_type: 'payment_approval',
                source_type: 'payment_run',
                source_id: id,
                approval_status: 'approved',
                approval_channel: 'chat_bulk',
                input_snapshot: { run_number: run.run_number, total_amount: run.total_amount },
                rationale_text: args.rationale || 'Bulk approved via Agent River chat'
              });
              
              success = true;
              message = `Approved payment run ${run.run_number}`;
              break;
            }
            case 'purchase_requisition': {
              const { data: pr } = await supabase.from('purchase_requisitions').select('*').eq('id', id).single();
              if (!pr) { message = `PR ${id} not found`; break; }
              if (pr.status !== 'pending_approval') { message = `PR ${pr.pr_number} not pending approval`; break; }
              
              const { error } = await supabase.from('purchase_requisitions').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', id);
              if (error) { message = error.message; break; }
              
              await supabase.from('decision_traces').insert({
                org_id: pr.org_id,
                decision_type: 'pr_approval',
                source_type: 'purchase_requisition',
                source_id: id,
                approval_status: 'approved',
                approval_channel: 'chat_bulk',
                input_snapshot: { pr_number: pr.pr_number, total_amount: pr.total_amount },
                rationale_text: args.rationale || 'Bulk approved via Agent River chat'
              });
              
              success = true;
              message = `Approved PR ${pr.pr_number}`;
              break;
            }
          }
          
          results.push({ id, success, message });
        }
        
        const successCount = results.filter(r => r.success).length;
        return JSON.stringify({
          total: args.ids.length,
          approved: successCount,
          failed: args.ids.length - successCount,
          details: results
        });
      }

      // =========================================================================
      // HR & PAYROLL TOOLS
      // =========================================================================

      case 'get_employees': {
        let query = supabase.from('employees').select('*, department:departments(name), position:positions(title)');
        if (args.status) query = query.eq('employment_status', args.status);
        if (args.department_id) query = query.eq('department_id', args.department_id);
        const { data } = await query.order('last_name').limit(50);
        return JSON.stringify(data?.map((e: any) => ({
          id: e.id,
          employee_number: e.employee_number,
          name: `${e.first_name} ${e.last_name}`,
          email: e.email,
          department: e.department?.name,
          position: e.position?.title,
          status: e.employment_status,
          hire_date: e.hire_date,
          base_salary: e.base_salary,
          hourly_rate: e.hourly_rate
        })) || []);
      }

      case 'get_employee_summary': {
        const { data: employees } = await supabase.from('employees').select('employment_status, department_id, base_salary, departments(name)');
        if (!employees?.length) return JSON.stringify({ message: "No employees found" });

        const statuses = ['active', 'on_leave', 'terminated', 'suspended'];
        const byStatus = statuses.map(s => ({
          status: s,
          count: employees.filter((e: any) => e.employment_status === s).length
        }));

        const deptCounts: Record<string, number> = {};
        employees.forEach((e: any) => {
          const deptName = e.departments?.name || 'Unassigned';
          deptCounts[deptName] = (deptCounts[deptName] || 0) + 1;
        });

        const totalSalary = employees.filter((e: any) => e.employment_status === 'active')
          .reduce((sum: number, e: any) => sum + (e.base_salary || 0), 0);

        return JSON.stringify({
          total_employees: employees.length,
          active_employees: employees.filter((e: any) => e.employment_status === 'active').length,
          by_status: byStatus,
          by_department: Object.entries(deptCounts).map(([dept, count]) => ({ department: dept, count })),
          total_monthly_payroll: totalSalary
        });
      }

      case 'get_departments': {
        const { data: departments } = await supabase.from('departments').select('*, manager:employees(first_name, last_name)');
        const { data: employees } = await supabase.from('employees').select('department_id').eq('employment_status', 'active');
        
        const deptCounts: Record<string, number> = {};
        employees?.forEach((e: any) => {
          if (e.department_id) deptCounts[e.department_id] = (deptCounts[e.department_id] || 0) + 1;
        });

        return JSON.stringify(departments?.map((d: any) => ({
          id: d.id,
          code: d.code,
          name: d.name,
          description: d.description,
          manager: d.manager ? `${d.manager.first_name} ${d.manager.last_name}` : null,
          employee_count: deptCounts[d.id] || 0,
          is_active: d.is_active
        })) || []);
      }

      case 'get_positions': {
        let query = supabase.from('positions').select('*, department:departments(name)');
        if (args.department_id) query = query.eq('department_id', args.department_id);
        const { data } = await query.order('title');
        return JSON.stringify(data?.map((p: any) => ({
          id: p.id,
          code: p.code,
          title: p.title,
          department: p.department?.name,
          min_salary: p.min_salary,
          max_salary: p.max_salary,
          is_active: p.is_active
        })) || []);
      }

      case 'get_payroll_summary': {
        const { data: employees } = await supabase.from('employees').select('base_salary, hourly_rate, employment_status, pay_frequency');
        const { data: runs } = await supabase.from('payroll_runs').select('*').order('run_date', { ascending: false }).limit(5);
        
        const activeEmps = employees?.filter((e: any) => e.employment_status === 'active') || [];
        const totalMonthlySalary = activeEmps.reduce((sum: number, e: any) => sum + (e.base_salary || 0), 0);
        
        return JSON.stringify({
          active_employees: activeEmps.length,
          total_monthly_base_salary: totalMonthlySalary,
          recent_payroll_runs: runs?.map((r: any) => ({
            run_number: r.run_number,
            run_date: r.run_date,
            status: r.status,
            total_gross: r.total_gross,
            total_net: r.total_net,
            employee_count: r.employee_count
          })) || []
        });
      }

      case 'get_payroll_runs': {
        let query = supabase.from('payroll_runs').select('*, payroll_period:payroll_periods(period_name)');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.order('run_date', { ascending: false }).limit(args.limit || 10);
        return JSON.stringify(data?.map((r: any) => ({
          id: r.id,
          run_number: r.run_number,
          period: r.payroll_period?.period_name,
          run_date: r.run_date,
          status: r.status,
          employee_count: r.employee_count,
          total_gross: r.total_gross,
          total_deductions: r.total_deductions,
          total_net: r.total_net,
          total_employer_cost: r.total_employer_cost
        })) || []);
      }

      case 'get_payroll_periods': {
        let query = supabase.from('payroll_periods').select('*');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.order('period_start', { ascending: false }).limit(10);
        return JSON.stringify(data || []);
      }

      case 'get_salary_analysis': {
        const { data: employees } = await supabase.from('employees')
          .select('base_salary, department_id, position_id, departments(name), positions(title)')
          .eq('employment_status', 'active')
          .not('base_salary', 'is', null);
        
        if (!employees?.length) return JSON.stringify({ message: "No salary data available" });

        const byDept: Record<string, { total: number; count: number; min: number; max: number }> = {};
        employees.forEach((e: any) => {
          const dept = e.departments?.name || 'Unassigned';
          if (!byDept[dept]) byDept[dept] = { total: 0, count: 0, min: Infinity, max: 0 };
          byDept[dept].total += e.base_salary;
          byDept[dept].count++;
          byDept[dept].min = Math.min(byDept[dept].min, e.base_salary);
          byDept[dept].max = Math.max(byDept[dept].max, e.base_salary);
        });

        const totalSalary = employees.reduce((sum: number, e: any) => sum + e.base_salary, 0);

        return JSON.stringify({
          total_employees: employees.length,
          total_salary: totalSalary,
          average_salary: totalSalary / employees.length,
          by_department: Object.entries(byDept).map(([dept, stats]) => ({
            department: dept,
            count: stats.count,
            total: stats.total,
            average: stats.total / stats.count,
            min: stats.min === Infinity ? 0 : stats.min,
            max: stats.max
          }))
        });
      }

      case 'get_deduction_types': {
        const { data } = await supabase.from('deduction_types').select('*').eq('is_active', true);
        return JSON.stringify(data || []);
      }

      // =========================================================================
      // TAX MANAGEMENT TOOLS
      // =========================================================================

      case 'get_tax_codes': {
        let query = supabase.from('tax_codes').select('*');
        if (args.tax_type) query = query.eq('tax_type', args.tax_type);
        const { data } = await query.order('code');
        return JSON.stringify(data || []);
      }

      case 'get_tax_rates': {
        let query = supabase.from('tax_rates').select('*, tax_code:tax_codes(code, name), jurisdiction:tax_jurisdictions(name)');
        if (args.tax_code_id) query = query.eq('tax_code_id', args.tax_code_id);
        if (args.jurisdiction_id) query = query.eq('jurisdiction_id', args.jurisdiction_id);
        const { data } = await query.eq('is_active', true);
        return JSON.stringify(data?.map((r: any) => ({
          id: r.id,
          tax_code: r.tax_code?.code,
          tax_name: r.tax_code?.name,
          jurisdiction: r.jurisdiction?.name,
          rate: r.rate,
          effective_from: r.effective_from,
          effective_to: r.effective_to
        })) || []);
      }

      case 'get_tax_jurisdictions': {
        let query = supabase.from('tax_jurisdictions').select('*').eq('is_active', true);
        if (args.country_code) query = query.eq('country_code', args.country_code);
        const { data } = await query.order('name');
        return JSON.stringify(data || []);
      }

      case 'get_tax_transactions': {
        let query = supabase.from('tax_transactions').select('*, tax_code:tax_codes(code, name)');
        if (args.status) query = query.eq('status', args.status);
        if (args.period) query = query.eq('tax_period', args.period);
        const { data } = await query.order('transaction_date', { ascending: false }).limit(50);
        return JSON.stringify(data?.map((t: any) => ({
          id: t.id,
          date: t.transaction_date,
          period: t.tax_period,
          tax_code: t.tax_code?.code,
          source_type: t.source_type,
          base_amount: t.base_amount,
          tax_rate: t.tax_rate,
          tax_amount: t.tax_amount,
          status: t.status
        })) || []);
      }

      case 'get_tax_summary': {
        const currentMonth = new Date().toISOString().slice(0, 7);
        const { data: transactions } = await supabase.from('tax_transactions').select('*');
        
        const mtdTx = transactions?.filter((t: any) => t.transaction_date?.startsWith(currentMonth)) || [];
        
        const salesTax = mtdTx.filter((t: any) => t.source_type === 'invoice')
          .reduce((sum: number, t: any) => sum + (t.tax_amount || 0), 0);
        const purchaseTax = mtdTx.filter((t: any) => t.source_type === 'bill')
          .reduce((sum: number, t: any) => sum + (t.tax_amount || 0), 0);
        
        return JSON.stringify({
          period: currentMonth,
          sales_tax_collected: salesTax,
          purchase_tax_paid: purchaseTax,
          net_tax_payable: salesTax - purchaseTax,
          total_transactions: mtdTx.length
        });
      }

      case 'get_filing_periods': {
        let query = supabase.from('tax_filing_periods').select('*, jurisdiction:tax_jurisdictions(name)');
        if (args.status) query = query.eq('status', args.status);
        const { data } = await query.order('due_date', { ascending: false }).limit(20);
        return JSON.stringify(data?.map((p: any) => ({
          id: p.id,
          period: p.period_name,
          jurisdiction: p.jurisdiction?.name,
          due_date: p.due_date,
          status: p.status,
          sales_tax: p.sales_tax_amount,
          purchase_tax: p.purchase_tax_amount,
          net_payable: p.net_payable
        })) || []);
      }

      case 'get_overdue_filings': {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase.from('tax_filing_periods')
          .select('*, jurisdiction:tax_jurisdictions(name)')
          .lt('due_date', today)
          .in('status', ['open', 'pending']);
        
        return JSON.stringify({
          overdue_count: data?.length || 0,
          filings: data?.map((p: any) => ({
            period: p.period_name,
            jurisdiction: p.jurisdiction?.name,
            due_date: p.due_date,
            days_overdue: Math.floor((Date.now() - new Date(p.due_date).getTime()) / (1000 * 60 * 60 * 24)),
            net_payable: p.net_payable
          })) || []
        });
      }

      // =========================================================================
      // MULTI-CURRENCY TOOLS
      // =========================================================================

      case 'get_exchange_rates': {
        let query = supabase.from('exchange_rates').select('*');
        if (args.from_currency) query = query.eq('from_currency', args.from_currency);
        if (args.to_currency) query = query.eq('to_currency', args.to_currency);
        if (args.rate_type) query = query.eq('rate_type', args.rate_type);
        const { data } = await query.order('rate_date', { ascending: false }).limit(50);
        return JSON.stringify(data || []);
      }

      case 'get_currency_revaluations': {
        let query = supabase.from('currency_revaluations').select('*');
        if (args.gain_loss_type) query = query.eq('gain_loss_type', args.gain_loss_type);
        if (args.currency) query = query.eq('original_currency', args.currency);
        const { data } = await query.order('revaluation_date', { ascending: false }).limit(50);
        return JSON.stringify(data?.map((r: any) => ({
          id: r.id,
          date: r.revaluation_date,
          source_type: r.source_type,
          currency: r.original_currency,
          original_amount: r.original_amount,
          original_rate: r.original_rate,
          current_rate: r.current_rate,
          gain_loss: r.gain_loss_amount,
          type: r.gain_loss_type
        })) || []);
      }

      case 'get_fx_summary': {
        const { data: revaluations } = await supabase.from('currency_revaluations').select('*');
        
        const unrealizedGains = revaluations?.filter((r: any) => r.gain_loss_type === 'unrealized' && r.gain_loss_amount > 0)
          .reduce((sum: number, r: any) => sum + r.gain_loss_amount, 0) || 0;
        const unrealizedLosses = revaluations?.filter((r: any) => r.gain_loss_type === 'unrealized' && r.gain_loss_amount < 0)
          .reduce((sum: number, r: any) => sum + Math.abs(r.gain_loss_amount), 0) || 0;
        const realizedGains = revaluations?.filter((r: any) => r.gain_loss_type === 'realized' && r.gain_loss_amount > 0)
          .reduce((sum: number, r: any) => sum + r.gain_loss_amount, 0) || 0;
        const realizedLosses = revaluations?.filter((r: any) => r.gain_loss_type === 'realized' && r.gain_loss_amount < 0)
          .reduce((sum: number, r: any) => sum + Math.abs(r.gain_loss_amount), 0) || 0;

        return JSON.stringify({
          unrealized: {
            gains: unrealizedGains,
            losses: unrealizedLosses,
            net: unrealizedGains - unrealizedLosses
          },
          realized: {
            gains: realizedGains,
            losses: realizedLosses,
            net: realizedGains - realizedLosses
          },
          total_net_gain_loss: (unrealizedGains - unrealizedLosses) + (realizedGains - realizedLosses)
        });
      }

      case 'get_fx_exposure': {
        const { data: invoices } = await supabase.from('invoices').select('currency, total, functional_total').neq('status', 'paid');
        const { data: bills } = await supabase.from('bills').select('currency, total, functional_total').neq('status', 'paid');
        
        const exposure: Record<string, { receivables: number; payables: number }> = {};
        
        invoices?.forEach((i: any) => {
          if (i.currency && i.currency !== 'USD') {
            if (!exposure[i.currency]) exposure[i.currency] = { receivables: 0, payables: 0 };
            exposure[i.currency].receivables += i.total || 0;
          }
        });
        
        bills?.forEach((b: any) => {
          if (b.currency && b.currency !== 'USD') {
            if (!exposure[b.currency]) exposure[b.currency] = { receivables: 0, payables: 0 };
            exposure[b.currency].payables += b.total || 0;
          }
        });

        return JSON.stringify({
          exposures: Object.entries(exposure).map(([currency, amounts]) => ({
            currency,
            receivables: amounts.receivables,
            payables: amounts.payables,
            net_exposure: amounts.receivables - amounts.payables
          })),
          total_foreign_receivables: Object.values(exposure).reduce((sum, e) => sum + e.receivables, 0),
          total_foreign_payables: Object.values(exposure).reduce((sum, e) => sum + e.payables, 0)
        });
      }

      case 'get_latest_rates': {
        const { data } = await supabase.from('exchange_rates')
          .select('*')
          .order('rate_date', { ascending: false });
        
        // Get latest rate per currency pair
        const latestRates: Record<string, any> = {};
        data?.forEach((r: any) => {
          const key = `${r.from_currency}-${r.to_currency}`;
          if (!latestRates[key]) latestRates[key] = r;
        });

        return JSON.stringify(Object.values(latestRates).map((r: any) => ({
          from: r.from_currency,
          to: r.to_currency,
          rate: r.rate,
          date: r.rate_date,
          type: r.rate_type
        })));
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
// LOVABLE AI GATEWAY HELPER
// ============================================================================

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

async function callLovableAI(messages: any[], tools?: any[], toolChoice?: string): Promise<any> {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY not configured");

  const body: any = {
    model: 'google/gemini-3-flash-preview',
    messages,
    max_tokens: 3000,
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = toolChoice || 'auto';
  }

  const response = await fetch(LOVABLE_AI_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${lovableKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Lovable AI error:', response.status, errorText);
    if (response.status === 429) throw new Error('Rate limit exceeded. Please try again in a moment.');
    if (response.status === 402) throw new Error('AI usage limit reached. Please add credits to your workspace.');
    throw new Error(`AI service error: ${response.status}`);
  }

  return response.json();
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

  const messages: any[] = [
    { role: 'system', content: agent.prompt },
    { role: 'user', content: task }
  ];

  let toolCallCount = 0;

  // Initial call with tools
  let data = await callLovableAI(messages, agent.tools, 'auto');
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

    data = await callLovableAI(messages, agent.tools, 'auto');
    assistantMessage = data.choices[0].message;
  }

  return { response: assistantMessage.content, toolCalls: toolCallCount };
}

// ============================================================================
// ORCHESTRATOR TOOL EXECUTION
// ============================================================================

async function executeOrchestratorTool(toolName: string, args: any, supabase: any, _apiKey?: string): Promise<string> {
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
    'call_approvals_agent': 'approvals_agent',
    'call_hr_payroll_agent': 'hr_payroll_agent',
    'call_tax_agent': 'tax_agent',
    'call_currency_agent': 'currency_agent',
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
// AUTH HELPER - Validates user and extracts verified org_id
// ============================================================================

async function validateAuthAndGetOrgId(req: Request): Promise<{ user: any; org_id: string; error?: string }> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, org_id: '', error: 'Missing or invalid authorization header' };
  }

  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  // Verify user token using getClaims for efficiency
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

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authentication and get verified org_id (optional - allow unauthenticated)
    const { user, org_id } = await validateAuthAndGetOrgId(req);

    const { messages } = await req.json();
    console.log('Agent River request - messages:', messages.length, 'org_id:', org_id || 'none', 'user:', user?.id || 'anonymous');

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // For unauthenticated users, use a simpler system prompt
    const systemPrompt = org_id 
      ? AGENT_RIVER_SYSTEM 
      : `You are Agent River, an AI assistant for the TAPAANO ERP system. 
You can answer general questions about ERP systems, finance, accounting, inventory, HR, and business processes.
However, to access organization-specific data (like invoices, customers, inventory levels, etc.), the user needs to sign in first.
If asked about specific data, politely explain that sign-in is required to access that information.`;

    const apiMessages: any[] = [
      { role: 'system', content: systemPrompt },
      ...messages
    ];

    // For unauthenticated users, don't use tools - just chat
    const useTools = !!org_id;

    // Initial orchestrator call via Lovable AI
    let data = await callLovableAI(
      apiMessages,
      useTools ? ORCHESTRATOR_TOOLS : undefined,
      useTools ? 'auto' : undefined
    );
    let assistantMessage = data.choices[0].message;
    let totalToolCalls = 0;
    let agentsUsed: string[] = [];

    // Process orchestrator tool calls (sub-agent delegations)
    while (useTools && assistantMessage.tool_calls) {
      const toolResults = [];

      for (const toolCall of assistantMessage.tool_calls) {
        totalToolCalls++;
        const args = JSON.parse(toolCall.function.arguments || '{}');
        const result = await executeOrchestratorTool(toolCall.function.name, args, supabase, '');
        
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

      data = await callLovableAI(apiMessages, ORCHESTRATOR_TOOLS, 'auto');
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
