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
// AGENT DEFINITIONS - Multi-Agent Architecture
// ============================================================================

const ROUTER_AGENT = {
  name: "router_agent",
  model: "gpt-4.1-2025-04-14",
  instructions: `You are a routing agent for a finance copilot system. Analyze the user's request and determine which specialized agent should handle it.

Available agents:
1. bookkeeper_agent: General finance queries, AR/AP summaries, metrics, cash position, transaction classification, journal entries, key metrics
2. collections_agent: Overdue invoices, dunning emails, collection strategies, customer payment follow-ups, payment reminders
3. close_assistant_agent: Period close tasks, close checklists, reconciliation status, month-end procedures, close progress
4. p2p_agent: Procure-to-Pay - Purchase orders, goods receipts, bills, vendor management, 3-way matching, payment runs
5. o2c_agent: Order-to-Cash - Quotations, sales orders, shipments, invoices, customer management, revenue tracking, quote-to-cash
6. inventory_agent: Inventory management - Warehouses, products, stock levels, transfers, cycle counts, serial/batch tracking, reorder alerts

Route based on intent:
- Questions about purchasing, POs, vendors, goods receipts, bills to pay, payment runs → p2p_agent
- Questions about quotations, quotes, sales orders, shipments, customer invoices, revenue, O2C cycle → o2c_agent
- Questions about overdue invoices, dunning emails, collection strategies → collections_agent
- Questions about period close, month-end, reconciliation, close tasks → close_assistant_agent
- Questions about inventory, stock, warehouses, transfers, cycle counts, products, SKUs, reorder, serial numbers, batch lots → inventory_agent
- Everything else (general metrics, cash, transactions, journal entries) → bookkeeper_agent

Respond with ONLY the agent name: "bookkeeper_agent", "collections_agent", "close_assistant_agent", "p2p_agent", "o2c_agent", or "inventory_agent"`,
};

const BOOKKEEPER_AGENT = {
  name: "bookkeeper_agent",
  model: "gpt-4.1-2025-04-14",
  instructions: `You are a senior bookkeeper AI assistant. You help with general financial queries, metrics, cash management, and transaction processing.

Capabilities:
- Query AR aging and AP summaries
- Check cash positions across bank accounts
- Classify bank transactions to GL accounts
- Create draft journal entries
- Provide key financial metrics (DSO, DPO, working capital)
- Query all master data: customers, vendors, accounts
- Query all transactions: sales orders, purchase orders, invoices, bills, shipments, goods receipts, payment runs, journal entries

Be precise with numbers. Format currency as $X,XXX.XX. Use bullet points for clarity.`,
  tools: [
    {
      type: "function",
      function: {
        name: "get_ar_aging",
        description: "Get accounts receivable aging summary with buckets (current, 1-30, 31-60, 61-90, 90+ days)",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_ap_summary",
        description: "Get accounts payable summary with pending and overdue bills",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_cash_position",
        description: "Get current cash position across all bank accounts",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_unmatched_transactions",
        description: "Get bank transactions that need classification or matching",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "classify_transaction",
        description: "Suggest GL account classification for a bank transaction",
        parameters: {
          type: "object",
          properties: {
            description: { type: "string", description: "Transaction description" },
            amount: { type: "number", description: "Transaction amount" },
          },
          required: ["description", "amount"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "create_draft_journal_entry",
        description: "Create a draft journal entry for review",
        parameters: {
          type: "object",
          properties: {
            memo: { type: "string", description: "Journal entry description" },
            lines: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  account_name: { type: "string" },
                  debit: { type: "number" },
                  credit: { type: "number" },
                },
              },
              description: "Debit and credit lines",
            },
          },
          required: ["memo", "lines"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_key_metrics",
        description: "Get key financial metrics: revenue, expenses, net income, DSO, working capital",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_accounts",
        description: "Get chart of accounts / GL accounts. Use this to look up account codes, account types, and account names.",
        parameters: {
          type: "object",
          properties: {
            account_type: { type: "string", enum: ["asset", "liability", "equity", "revenue", "expense"], description: "Filter by account type" },
            search: { type: "string", description: "Search term to filter accounts by name or code" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_customers",
        description: "Get customer list with contact info and credit terms.",
        parameters: {
          type: "object",
          properties: {
            search: { type: "string", description: "Search term to filter customers by name or email" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_vendors",
        description: "Get vendor list with contact info and payment terms.",
        parameters: {
          type: "object",
          properties: {
            search: { type: "string", description: "Search term to filter vendors by name or email" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_invoices",
        description: "Get invoices with filtering options.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "sent", "paid", "overdue", "cancelled"], description: "Filter by status" },
            customer_name: { type: "string", description: "Filter by customer name" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_bills",
        description: "Get bills/payables with filtering options.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "pending", "paid", "overdue", "cancelled"], description: "Filter by status" },
            vendor_name: { type: "string", description: "Filter by vendor name" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_sales_orders",
        description: "Get sales orders with filtering options.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "approved", "shipped", "invoiced", "completed", "cancelled"], description: "Filter by status" },
            customer_name: { type: "string", description: "Filter by customer name" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_purchase_orders",
        description: "Get purchase orders with filtering options.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "pending_approval", "approved", "partially_received", "received", "cancelled"], description: "Filter by status" },
            vendor_name: { type: "string", description: "Filter by vendor name" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_shipments",
        description: "Get shipments with filtering options.",
        parameters: {
          type: "object",
          properties: {
            so_number: { type: "string", description: "Filter by sales order number" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_goods_receipts",
        description: "Get goods receipts with filtering options.",
        parameters: {
          type: "object",
          properties: {
            po_number: { type: "string", description: "Filter by purchase order number" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_payment_runs",
        description: "Get payment runs with filtering options.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "pending_approval", "approved", "processing", "completed", "failed"], description: "Filter by status" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_journal_entries",
        description: "Get journal entries with filtering options.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "posted", "reversed"], description: "Filter by status" },
            period: { type: "string", description: "Filter by period (YYYY-MM format)" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_bank_transactions",
        description: "Get bank transactions with filtering options.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["pending", "matched", "reconciled"], description: "Filter by status" },
            bank_account_name: { type: "string", description: "Filter by bank account name" },
          },
          required: [],
        },
      },
    },
  ],
};

const COLLECTIONS_AGENT = {
  name: "collections_agent",
  model: "gpt-4.1-2025-04-14",
  instructions: `You are a collections specialist AI. You help manage accounts receivable collections with professionalism and empathy.

Capabilities:
- List overdue invoices with prioritization
- Draft dunning/collection emails at various escalation levels
- Analyze customer payment patterns
- Suggest collection strategies based on customer history
- Generate prioritized collection worklists

Always maintain professionalism. Be firm but fair. Consider customer relationships.`,
  tools: [
    {
      type: "function",
      function: {
        name: "get_overdue_invoices",
        description: "Get list of overdue invoices with customer details and days overdue",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_ar_aging",
        description: "Get accounts receivable aging summary",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_collection_priority_list",
        description: "Get prioritized list of invoices for collection based on amount, age, and risk",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "draft_dunning_email",
        description: "Draft a collections/dunning email for overdue invoices",
        parameters: {
          type: "object",
          properties: {
            customer_name: { type: "string", description: "Customer name" },
            invoice_number: { type: "string", description: "Invoice number" },
            amount: { type: "number", description: "Amount due" },
            days_overdue: { type: "number", description: "Days overdue" },
            escalation_level: {
              type: "string",
              enum: ["friendly_reminder", "firm_reminder", "final_notice", "collections_warning"],
              description: "Email escalation level",
            },
          },
          required: ["customer_name", "amount", "days_overdue", "escalation_level"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_customer_payment_history",
        description: "Get payment history for a specific customer",
        parameters: {
          type: "object",
          properties: {
            customer_name: { type: "string", description: "Customer name to look up" },
          },
          required: ["customer_name"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "suggest_collection_strategy",
        description: "Suggest a collection strategy based on customer history and invoice details",
        parameters: {
          type: "object",
          properties: {
            customer_name: { type: "string", description: "Customer name" },
            total_overdue: { type: "number", description: "Total overdue amount" },
            days_overdue: { type: "number", description: "Days since oldest invoice due" },
          },
          required: ["customer_name", "total_overdue", "days_overdue"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_customers",
        description: "Get customer list with contact info and credit terms. Use this to look up customer details.",
        parameters: {
          type: "object",
          properties: {
            search: { type: "string", description: "Search term to filter customers by name or email" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_invoices",
        description: "Get invoices with filtering. Use to look up specific invoices or invoice statuses.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "sent", "paid", "overdue", "cancelled"], description: "Filter by status" },
            customer_name: { type: "string", description: "Filter by customer name" },
          },
          required: [],
        },
      },
    },
  ],
};

const CLOSE_ASSISTANT_AGENT = {
  name: "close_assistant_agent",
  model: "gpt-4.1-2025-04-14",
  instructions: `You are a period close assistant AI. You help finance teams manage month-end and period close efficiently.

Capabilities:
- Track close task status and progress
- Identify blockers and overdue tasks
- Generate close status reports
- Assist with reconciliation tracking
- Provide close timeline estimates

Be organized and systematic. Prioritize critical path items. Help teams close faster.`,
  tools: [
    {
      type: "function",
      function: {
        name: "get_close_status",
        description: "Get current period close status and progress percentage",
        parameters: {
          type: "object",
          properties: {
            period: { type: "string", description: "Period identifier like 2024-11" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_close_tasks",
        description: "Get all close tasks for a period with status and assignees",
        parameters: {
          type: "object",
          properties: {
            period: { type: "string", description: "Period identifier" },
            status: { type: "string", enum: ["pending", "in_progress", "complete", "overdue"], description: "Filter by status" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_close_blockers",
        description: "Identify blockers preventing period close completion",
        parameters: {
          type: "object",
          properties: {
            period: { type: "string", description: "Period identifier" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "generate_close_report",
        description: "Generate a summary report of period close progress",
        parameters: {
          type: "object",
          properties: {
            period: { type: "string", description: "Period identifier" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "update_close_task",
        description: "Update status of a close task",
        parameters: {
          type: "object",
          properties: {
            task_name: { type: "string", description: "Task name" },
            status: { type: "string", enum: ["pending", "in_progress", "complete"], description: "New status" },
          },
          required: ["task_name", "status"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_accounts",
        description: "Get chart of accounts / GL accounts. Use this to look up account codes, account types, and account names.",
        parameters: {
          type: "object",
          properties: {
            account_type: { type: "string", enum: ["asset", "liability", "equity", "revenue", "expense"], description: "Filter by account type" },
            search: { type: "string", description: "Search term to filter accounts by name or code" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_journal_entries",
        description: "Get journal entries with filtering. Use to review posted or draft entries.",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "posted", "reversed"], description: "Filter by status" },
            period: { type: "string", description: "Filter by period (YYYY-MM format)" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_ar_aging",
        description: "Get accounts receivable aging summary for reconciliation",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_ap_summary",
        description: "Get accounts payable summary for reconciliation",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
  ],
};

// ============================================================================
// P2P AGENT - Procure-to-Pay
// ============================================================================

const P2P_AGENT = {
  name: "p2p_agent",
  model: "gpt-4.1-2025-04-14",
  instructions: `You are a Procure-to-Pay (P2P) specialist AI. You help manage the full procurement cycle from purchase orders to payments, with integrated inventory management.

Capabilities:
- View and analyze purchase orders and their status
- Track goods receipts and delivery status with inventory updates
- Manage bills and payment schedules
- Perform 3-way matching (PO, GR, Bill)
- Analyze vendor performance and spending
- Create and manage payment runs
- Identify AP optimization opportunities
- Update inventory when goods are received
- Check stock levels before creating POs
- Generate automatic reorder suggestions based on low stock alerts
- Track inventory impact of procurement

Be thorough with matching and validation. Flag discrepancies. Help optimize cash flow timing. Ensure inventory is updated when goods arrive.`,
  tools: [
    {
      type: "function",
      function: {
        name: "get_purchase_orders",
        description: "Get purchase orders with status and vendor details",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "pending_approval", "approved", "partially_received", "received", "cancelled"], description: "Filter by PO status" },
            vendor_name: { type: "string", description: "Filter by vendor name" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_goods_receipts",
        description: "Get goods receipts with PO linkage and receipt details",
        parameters: {
          type: "object",
          properties: {
            po_number: { type: "string", description: "Filter by PO number" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_bills_status",
        description: "Get bills with status, vendor, and matching information",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "pending", "paid", "overdue", "cancelled"], description: "Filter by bill status" },
            vendor_name: { type: "string", description: "Filter by vendor name" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "perform_three_way_match",
        description: "Perform 3-way match between PO, goods receipt, and bill",
        parameters: {
          type: "object",
          properties: {
            po_number: { type: "string", description: "Purchase order number" },
          },
          required: ["po_number"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_vendor_analysis",
        description: "Get vendor spending analysis and performance metrics",
        parameters: {
          type: "object",
          properties: {
            vendor_name: { type: "string", description: "Specific vendor to analyze (optional)" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_payment_runs",
        description: "Get payment run status and scheduled payments",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "pending_approval", "approved", "processing", "completed", "failed"], description: "Filter by status" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_bills_due_for_payment",
        description: "Get bills that are due for payment within a date range",
        parameters: {
          type: "object",
          properties: {
            days_ahead: { type: "number", description: "Number of days to look ahead for due bills" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_p2p_cycle_summary",
        description: "Get end-to-end P2P cycle summary with metrics",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_ap_summary",
        description: "Get accounts payable summary with pending and overdue bills",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_vendors",
        description: "Get vendor list with contact info and payment terms. Use this to look up vendor details.",
        parameters: {
          type: "object",
          properties: {
            search: { type: "string", description: "Search term to filter vendors by name or email" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_accounts",
        description: "Get chart of accounts / GL accounts. Use this to look up expense accounts for PO coding.",
        parameters: {
          type: "object",
          properties: {
            account_type: { type: "string", enum: ["asset", "liability", "equity", "revenue", "expense"], description: "Filter by account type" },
            search: { type: "string", description: "Search term to filter accounts by name or code" },
          },
          required: [],
        },
      },
    },
    // Inventory Integration Tools
    {
      type: "function",
      function: {
        name: "get_inventory_stock",
        description: "Get current stock levels by warehouse and product. Use to check availability before ordering.",
        parameters: {
          type: "object",
          properties: {
            warehouse_name: { type: "string", description: "Filter by warehouse name" },
            product_sku: { type: "string", description: "Filter by product SKU" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_low_stock_alerts",
        description: "Get products that are below their reorder point. Use to identify what needs to be ordered.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_products",
        description: "Get product catalog with SKU, valuation method, and reorder settings",
        parameters: {
          type: "object",
          properties: {
            search: { type: "string", description: "Search term to filter by SKU or name" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_warehouses",
        description: "Get list of warehouses with location details",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "check_goods_receipt_inventory_impact",
        description: "Check how a goods receipt affects inventory. Shows what stock was added and current levels.",
        parameters: {
          type: "object",
          properties: {
            po_number: { type: "string", description: "Purchase order number to check" },
          },
          required: [],
        },
      },
    },
  ],
};

// ============================================================================
// O2C AGENT - Order-to-Cash
// ============================================================================

const O2C_AGENT = {
  name: "o2c_agent",
  model: "gpt-4.1-2025-04-14",
  instructions: `You are an Order-to-Cash (O2C) specialist AI. You help manage the full revenue cycle from quotations to cash collection, with integrated inventory management.

Capabilities:
- View and analyze quotations and their status (draft, sent, accepted, rejected, converted)
- Convert accepted quotations to sales orders
- View and analyze sales orders and their status
- Track shipments and delivery status with inventory updates
- Manage customer invoices and payments
- Analyze customer performance and credit
- Track revenue recognition pipeline
- Identify O2C bottlenecks and optimization opportunities
- Check stock availability before confirming orders
- Reserve inventory for confirmed sales orders
- Reduce inventory when shipments are created
- Warn about low stock or out-of-stock items

Be thorough with order fulfillment tracking. Help accelerate cash conversion. Maintain customer relationships. Ensure inventory accuracy.`,
  tools: [
    {
      type: "function",
      function: {
        name: "get_quotations",
        description: "Get quotations/quotes with status and customer details",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "sent", "accepted", "rejected", "expired", "converted"], description: "Filter by quotation status" },
            customer_name: { type: "string", description: "Filter by customer name" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_quotation_summary",
        description: "Get quotation pipeline summary with stats by status",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_quotations_expiring_soon",
        description: "Get quotations that are expiring within the specified days",
        parameters: {
          type: "object",
          properties: {
            days: { type: "number", description: "Number of days to look ahead for expiring quotations (default 7)" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_sales_orders",
        description: "Get sales orders with status and customer details",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "approved", "shipped", "invoiced", "completed", "cancelled"], description: "Filter by SO status" },
            customer_name: { type: "string", description: "Filter by customer name" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_shipments",
        description: "Get shipments with SO linkage and tracking details",
        parameters: {
          type: "object",
          properties: {
            so_number: { type: "string", description: "Filter by SO number" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_customer_invoices",
        description: "Get customer invoices with status and payment details",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "sent", "paid", "overdue", "cancelled"], description: "Filter by invoice status" },
            customer_name: { type: "string", description: "Filter by customer name" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_customer_analysis",
        description: "Get customer revenue analysis and payment performance",
        parameters: {
          type: "object",
          properties: {
            customer_name: { type: "string", description: "Specific customer to analyze (optional)" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_o2c_cycle_summary",
        description: "Get end-to-end O2C cycle summary with metrics",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_orders_pending_shipment",
        description: "Get sales orders that are approved but not yet shipped",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_shipments_pending_invoice",
        description: "Get shipments that haven't been invoiced yet",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_revenue_pipeline",
        description: "Get revenue pipeline from orders to cash collection",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_ar_aging",
        description: "Get accounts receivable aging summary",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_customers",
        description: "Get customer list with contact info and credit terms. Use this to look up customer details.",
        parameters: {
          type: "object",
          properties: {
            search: { type: "string", description: "Search term to filter customers by name or email" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_accounts",
        description: "Get chart of accounts / GL accounts. Use this to look up revenue accounts.",
        parameters: {
          type: "object",
          properties: {
            account_type: { type: "string", enum: ["asset", "liability", "equity", "revenue", "expense"], description: "Filter by account type" },
            search: { type: "string", description: "Search term to filter accounts by name or code" },
          },
          required: [],
        },
      },
    },
    // Inventory Integration Tools
    {
      type: "function",
      function: {
        name: "get_inventory_stock",
        description: "Get current stock levels by warehouse and product. Use to check availability before confirming orders.",
        parameters: {
          type: "object",
          properties: {
            warehouse_name: { type: "string", description: "Filter by warehouse name" },
            product_sku: { type: "string", description: "Filter by product SKU" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_low_stock_alerts",
        description: "Get products that are below their reorder point. Check before promising delivery dates.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_products",
        description: "Get product catalog with SKU, pricing, and stock settings",
        parameters: {
          type: "object",
          properties: {
            search: { type: "string", description: "Search term to filter by SKU or name" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_warehouses",
        description: "Get list of warehouses for shipping",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "check_order_fulfillment_status",
        description: "Check if sales order can be fulfilled based on current inventory levels",
        parameters: {
          type: "object",
          properties: {
            so_number: { type: "string", description: "Sales order number to check" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_shipment_inventory_impact",
        description: "Check how a shipment affects inventory. Shows what stock was deducted.",
        parameters: {
          type: "object",
          properties: {
            shipment_number: { type: "string", description: "Shipment number to check" },
          },
          required: [],
        },
      },
    },
  ],
};

// ============================================================================
// INVENTORY AGENT
// ============================================================================

const INVENTORY_AGENT = {
  name: "inventory_agent",
  model: "gpt-4.1-2025-04-14",
  instructions: `You are an Inventory Management specialist AI. You help manage warehouses, products, stock levels, transfers, and inventory tracking. Integrated with Payables (P2P) and Receivables (O2C) for full supply chain visibility.

Capabilities:
- View and analyze warehouse locations and bin locations
- Manage products catalog with valuation methods (FIFO, LIFO, Average)
- Track stock levels across warehouses
- Create and monitor stock transfers between warehouses
- Schedule and track cycle counts
- Manage serial number and batch/lot tracking
- Identify low stock items and reorder alerts
- Analyze inventory valuation and movements
- Track goods receipts from purchase orders (P2P integration)
- Monitor shipments and order fulfillment (O2C integration)
- View pending POs that will increase inventory
- View pending sales orders that will decrease inventory

Be precise with stock quantities. Help optimize inventory levels. Flag reorder alerts proactively. Show procurement and sales context when relevant.`,
  tools: [
    {
      type: "function",
      function: {
        name: "get_warehouses",
        description: "Get list of warehouses with location details",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_products",
        description: "Get product catalog with SKU, valuation method, and reorder settings",
        parameters: {
          type: "object",
          properties: {
            search: { type: "string", description: "Search term to filter by SKU or name" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_inventory_stock",
        description: "Get current stock levels by warehouse and product",
        parameters: {
          type: "object",
          properties: {
            warehouse_name: { type: "string", description: "Filter by warehouse name" },
            product_sku: { type: "string", description: "Filter by product SKU" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_low_stock_alerts",
        description: "Get products that are below their reorder point",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_stock_transfers",
        description: "Get stock transfers between warehouses",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["draft", "pending", "in_transit", "completed", "cancelled"], description: "Filter by status" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_cycle_counts",
        description: "Get scheduled and completed cycle counts",
        parameters: {
          type: "object",
          properties: {
            status: { type: "string", enum: ["scheduled", "in_progress", "completed", "cancelled"], description: "Filter by status" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_inventory_valuation",
        description: "Get total inventory valuation summary by warehouse",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_serial_numbers",
        description: "Get serial numbers for serialized products",
        parameters: {
          type: "object",
          properties: {
            product_sku: { type: "string", description: "Filter by product SKU" },
            status: { type: "string", description: "Filter by status (available, sold, etc.)" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_batch_lots",
        description: "Get batch/lot information for batch-tracked products",
        parameters: {
          type: "object",
          properties: {
            product_sku: { type: "string", description: "Filter by product SKU" },
            expiring_within_days: { type: "number", description: "Get batches expiring within X days" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_inventory_summary",
        description: "Get overall inventory summary with key metrics",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    // P2P Integration Tools
    {
      type: "function",
      function: {
        name: "get_pending_purchase_orders",
        description: "Get approved POs not yet fully received - shows incoming inventory",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_recent_goods_receipts",
        description: "Get recent goods receipts that added inventory",
        parameters: {
          type: "object",
          properties: {
            days: { type: "number", description: "Number of days to look back (default 30)" },
          },
          required: [],
        },
      },
    },
    // O2C Integration Tools
    {
      type: "function",
      function: {
        name: "get_pending_sales_orders",
        description: "Get confirmed sales orders not yet shipped - shows outgoing inventory demand",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    {
      type: "function",
      function: {
        name: "get_recent_shipments",
        description: "Get recent shipments that reduced inventory",
        parameters: {
          type: "object",
          properties: {
            days: { type: "number", description: "Number of days to look back (default 30)" },
          },
          required: [],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "get_inventory_demand_forecast",
        description: "Get inventory demand based on pending orders and historical patterns",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
  ],
};

// ============================================================================
// TOOL IMPLEMENTATIONS
// ============================================================================

async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  supabase: ReturnType<typeof createClient>,
  orgId: string
): Promise<string> {
  console.log(`Executing tool: ${toolName} with args:`, JSON.stringify(args));

  try {
    switch (toolName) {
      // ============ BOOKKEEPER TOOLS ============
      case "get_ar_aging": {
        const { data: invoices } = await supabase
          .from("invoices")
          .select("*, customers(name)")
          .eq("org_id", orgId)
          .in("status", ["sent", "overdue"]);

        const today = new Date();
        const aging = { current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0 };
        const customerAging: Record<string, typeof aging & { name: string }> = {};

        (invoices || []).forEach((inv: any) => {
          const dueDate = new Date(inv.due_date);
          const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
          const balance = inv.total - inv.amount_paid;
          const customerName = inv.customers?.name || "Unknown";

          if (!customerAging[customerName]) {
            customerAging[customerName] = { name: customerName, current: 0, days_1_30: 0, days_31_60: 0, days_61_90: 0, days_90_plus: 0 };
          }

          if (daysOverdue <= 0) {
            aging.current += balance;
            customerAging[customerName].current += balance;
          } else if (daysOverdue <= 30) {
            aging.days_1_30 += balance;
            customerAging[customerName].days_1_30 += balance;
          } else if (daysOverdue <= 60) {
            aging.days_31_60 += balance;
            customerAging[customerName].days_31_60 += balance;
          } else if (daysOverdue <= 90) {
            aging.days_61_90 += balance;
            customerAging[customerName].days_61_90 += balance;
          } else {
            aging.days_90_plus += balance;
            customerAging[customerName].days_90_plus += balance;
          }
        });

        const total = aging.current + aging.days_1_30 + aging.days_31_60 + aging.days_61_90 + aging.days_90_plus;
        return JSON.stringify({
          summary: {
            total_outstanding: total,
            current: aging.current,
            "1_30_days": aging.days_1_30,
            "31_60_days": aging.days_31_60,
            "61_90_days": aging.days_61_90,
            "90_plus_days": aging.days_90_plus,
          },
          by_customer: Object.values(customerAging).slice(0, 10),
        });
      }

      case "get_overdue_invoices": {
        const { data: invoices } = await supabase
          .from("invoices")
          .select("*, customers(name, email)")
          .eq("org_id", orgId)
          .eq("status", "overdue")
          .order("due_date", { ascending: true })
          .limit(20);

        const today = new Date();
        const overdueList = (invoices || []).map((inv: any) => ({
          invoice_number: inv.invoice_number,
          customer: inv.customers?.name,
          email: inv.customers?.email,
          amount: inv.total - inv.amount_paid,
          due_date: inv.due_date,
          days_overdue: Math.floor((today.getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24)),
        }));

        return JSON.stringify({ overdue_invoices: overdueList, count: overdueList.length });
      }

      case "get_ap_summary": {
        const { data: bills } = await supabase
          .from("bills")
          .select("*, vendors(name)")
          .eq("org_id", orgId)
          .in("status", ["pending", "overdue"]);

        const today = new Date();
        let totalPending = 0;
        let totalOverdue = 0;
        const vendorBalances: Record<string, number> = {};

        (bills || []).forEach((bill: any) => {
          const balance = bill.total - bill.amount_paid;
          const dueDate = new Date(bill.due_date);
          const isOverdue = dueDate < today;

          if (isOverdue) totalOverdue += balance;
          else totalPending += balance;

          const vendorName = bill.vendors?.name || "Unknown";
          vendorBalances[vendorName] = (vendorBalances[vendorName] || 0) + balance;
        });

        return JSON.stringify({
          total_ap: totalPending + totalOverdue,
          pending: totalPending,
          overdue: totalOverdue,
          top_vendors: Object.entries(vendorBalances)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 5)
            .map(([name, amount]) => ({ name, amount })),
        });
      }

      case "get_cash_position": {
        const { data: accounts } = await supabase
          .from("bank_accounts")
          .select("*")
          .eq("org_id", orgId)
          .eq("is_active", true);

        const totalCash = (accounts || []).reduce((sum: number, acc: any) => sum + Number(acc.current_balance), 0);
        return JSON.stringify({
          total_cash: totalCash,
          accounts: (accounts || []).map((acc: any) => ({
            name: acc.name,
            bank: acc.bank_name,
            balance: acc.current_balance,
            currency: acc.currency,
          })),
        });
      }

      case "get_unmatched_transactions": {
        const { data: transactions } = await supabase
          .from("bank_transactions")
          .select("*, bank_accounts(name)")
          .eq("org_id", orgId)
          .eq("status", "pending")
          .order("transaction_date", { ascending: false })
          .limit(20);

        return JSON.stringify({
          unmatched_count: (transactions || []).length,
          transactions: (transactions || []).map((tx: any) => ({
            id: tx.id,
            date: tx.transaction_date,
            description: tx.description,
            amount: tx.amount,
            account: tx.bank_accounts?.name,
          })),
        });
      }

      case "classify_transaction": {
        const { description, amount } = args as { description: string; amount: number };
        const desc = (description || "").toLowerCase();

        let suggestedAccount = "6900 - Other Expenses";
        let confidence = "low";

        if (desc.includes("aws") || desc.includes("cloud") || desc.includes("hosting")) {
          suggestedAccount = "6100 - Cloud Infrastructure";
          confidence = "high";
        } else if (desc.includes("payroll") || desc.includes("salary")) {
          suggestedAccount = "6200 - Payroll";
          confidence = "high";
        } else if (desc.includes("office") || desc.includes("supplies")) {
          suggestedAccount = "6300 - Office Supplies";
          confidence = "medium";
        } else if (desc.includes("software") || desc.includes("subscription")) {
          suggestedAccount = "6400 - Software & Subscriptions";
          confidence = "medium";
        } else if (desc.includes("interest")) {
          suggestedAccount = amount > 0 ? "4200 - Interest Income" : "7100 - Interest Expense";
          confidence = "high";
        } else if (desc.includes("fee") || desc.includes("charge")) {
          suggestedAccount = "6500 - Bank Fees";
          confidence = "medium";
        }

        return JSON.stringify({
          description,
          amount,
          suggested_account: suggestedAccount,
          confidence,
          requires_review: confidence !== "high",
        });
      }

      case "create_draft_journal_entry": {
        const { memo, lines } = args as {
          memo: string;
          lines: Array<{ account_name: string; debit: number; credit: number }>;
        };

        const totalDebit = (lines || []).reduce((sum, l) => sum + (l.debit || 0), 0);
        const totalCredit = (lines || []).reduce((sum, l) => sum + (l.credit || 0), 0);
        const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

        return JSON.stringify({
          draft_entry: {
            memo,
            lines,
            total_debit: totalDebit,
            total_credit: totalCredit,
            is_balanced: isBalanced,
            status: "draft",
          },
          validation: isBalanced ? "Entry is balanced and ready for review" : "WARNING: Entry is not balanced!",
          next_step: "Review and approve in the General Ledger module",
        });
      }

      case "get_key_metrics": {
        const [{ data: invoices }, { data: bills }, { data: bankAccounts }] = await Promise.all([
          supabase.from("invoices").select("total, amount_paid, due_date, status").eq("org_id", orgId),
          supabase.from("bills").select("total, amount_paid").eq("org_id", orgId),
          supabase.from("bank_accounts").select("current_balance").eq("org_id", orgId).eq("is_active", true),
        ]);

        const revenue = (invoices || [])
          .filter((i: any) => i.status === "paid")
          .reduce((sum: number, i: any) => sum + Number(i.total), 0);

        const expenses = (bills || [])
          .reduce((sum: number, b: any) => sum + Number(b.amount_paid), 0);

        const totalAR = (invoices || [])
          .filter((i: any) => i.status !== "paid" && i.status !== "cancelled")
          .reduce((sum: number, i: any) => sum + (Number(i.total) - Number(i.amount_paid)), 0);

        const totalCash = (bankAccounts || [])
          .reduce((sum: number, a: any) => sum + Number(a.current_balance), 0);

        const totalAP = (bills || [])
          .reduce((sum: number, b: any) => sum + (Number(b.total) - Number(b.amount_paid)), 0);

        return JSON.stringify({
          revenue_collected: revenue,
          expenses_paid: expenses,
          net_income: revenue - expenses,
          total_ar: totalAR,
          total_ap: totalAP,
          cash_position: totalCash,
          working_capital: totalCash + totalAR - totalAP,
          dso: totalAR > 0 && revenue > 0 ? Math.round((totalAR / (revenue / 30))) : 0,
        });
      }

      case "get_accounts": {
        const { account_type, search } = args as { account_type?: string; search?: string };

        let query = supabase
          .from("accounts")
          .select("code, name, account_type, is_active")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .order("code", { ascending: true });

        if (account_type) {
          query = query.eq("account_type", account_type);
        }

        const { data: accounts } = await query;

        let filteredAccounts = accounts || [];
        if (search) {
          const searchLower = search.toLowerCase();
          filteredAccounts = filteredAccounts.filter((a: any) =>
            a.name.toLowerCase().includes(searchLower) ||
            a.code.toLowerCase().includes(searchLower)
          );
        }

        return JSON.stringify({
          accounts: filteredAccounts.map((a: any) => ({
            code: a.code,
            name: a.name,
            type: a.account_type,
          })),
          count: filteredAccounts.length,
          note: filteredAccounts.length === 0 ? "No accounts found. The chart of accounts may need to be set up." : undefined,
        });
      }

      case "get_customers": {
        const { search } = args as { search?: string };

        let query = supabase
          .from("customers")
          .select("id, name, email, phone, address, payment_terms, credit_limit")
          .eq("org_id", orgId)
          .order("name", { ascending: true });

        const { data: customers } = await query;

        let filtered = customers || [];
        if (search) {
          const searchLower = search.toLowerCase();
          filtered = filtered.filter((c: any) =>
            c.name?.toLowerCase().includes(searchLower) ||
            c.email?.toLowerCase().includes(searchLower)
          );
        }

        return JSON.stringify({
          customers: filtered.map((c: any) => ({
            id: c.id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            payment_terms: c.payment_terms,
            credit_limit: c.credit_limit,
          })),
          count: filtered.length,
          note: filtered.length === 0 ? "No customers found." : undefined,
        });
      }

      case "get_vendors": {
        const { search } = args as { search?: string };

        let query = supabase
          .from("vendors")
          .select("id, name, email, phone, address, payment_terms")
          .eq("org_id", orgId)
          .order("name", { ascending: true });

        const { data: vendors } = await query;

        let filtered = vendors || [];
        if (search) {
          const searchLower = search.toLowerCase();
          filtered = filtered.filter((v: any) =>
            v.name?.toLowerCase().includes(searchLower) ||
            v.email?.toLowerCase().includes(searchLower)
          );
        }

        return JSON.stringify({
          vendors: filtered.map((v: any) => ({
            id: v.id,
            name: v.name,
            email: v.email,
            phone: v.phone,
            payment_terms: v.payment_terms,
          })),
          count: filtered.length,
          note: filtered.length === 0 ? "No vendors found." : undefined,
        });
      }

      case "get_invoices": {
        const { status, customer_name } = args as { status?: string; customer_name?: string };

        let query = supabase
          .from("invoices")
          .select("*, customers(name, email)")
          .eq("org_id", orgId)
          .order("issue_date", { ascending: false })
          .limit(50);

        if (status) {
          query = query.eq("status", status);
        }

        const { data: invoices } = await query;

        let filtered = invoices || [];
        if (customer_name) {
          const searchLower = customer_name.toLowerCase();
          filtered = filtered.filter((i: any) =>
            i.customers?.name?.toLowerCase().includes(searchLower)
          );
        }

        return JSON.stringify({
          invoices: filtered.map((inv: any) => ({
            invoice_number: inv.invoice_number,
            customer: inv.customers?.name,
            issue_date: inv.issue_date,
            due_date: inv.due_date,
            total: inv.total,
            amount_paid: inv.amount_paid,
            balance: inv.total - inv.amount_paid,
            status: inv.status,
          })),
          count: filtered.length,
        });
      }

      case "get_journal_entries": {
        const { status, period } = args as { status?: string; period?: string };

        let query = supabase
          .from("journal_entries")
          .select("id, entry_number, entry_date, memo, status, posted_at")
          .eq("org_id", orgId)
          .order("entry_date", { ascending: false })
          .limit(50);

        if (status) {
          query = query.eq("status", status);
        }

        const { data: entries } = await query;

        let filtered = entries || [];
        if (period) {
          filtered = filtered.filter((e: any) =>
            e.entry_date?.startsWith(period)
          );
        }

        // Get lines for each entry
        const entriesWithLines = await Promise.all(
          filtered.slice(0, 20).map(async (entry: any) => {
            const { data: lines } = await supabase
              .from("journal_lines")
              .select("debit, credit, memo, accounts(code, name)")
              .eq("journal_entry_id", entry.id);

            const totalDebit = (lines || []).reduce((sum: number, l: any) => sum + Number(l.debit || 0), 0);
            const totalCredit = (lines || []).reduce((sum: number, l: any) => sum + Number(l.credit || 0), 0);

            return {
              entry_number: entry.entry_number,
              entry_date: entry.entry_date,
              memo: entry.memo,
              status: entry.status,
              total_debit: totalDebit,
              total_credit: totalCredit,
              line_count: (lines || []).length,
            };
          })
        );

        return JSON.stringify({
          entries: entriesWithLines,
          count: filtered.length,
          note: filtered.length === 0 ? "No journal entries found." : undefined,
        });
      }

      case "get_bills": {
        const { status, vendor_name } = args as { status?: string; vendor_name?: string };

        let query = supabase
          .from("bills")
          .select("*, vendors(name), purchase_orders(po_number)")
          .eq("org_id", orgId)
          .order("due_date", { ascending: true })
          .limit(50);

        if (status) {
          query = query.eq("status", status);
        }

        const { data: bills } = await query;

        let filtered = bills || [];
        if (vendor_name) {
          const searchLower = vendor_name.toLowerCase();
          filtered = filtered.filter((b: any) =>
            b.vendors?.name?.toLowerCase().includes(searchLower)
          );
        }

        return JSON.stringify({
          bills: filtered.map((b: any) => ({
            bill_number: b.bill_number,
            vendor: b.vendors?.name,
            po_number: b.purchase_orders?.po_number,
            issue_date: b.issue_date,
            due_date: b.due_date,
            total: b.total,
            amount_paid: b.amount_paid,
            balance: b.total - b.amount_paid,
            status: b.status,
            match_status: b.match_status,
          })),
          count: filtered.length,
        });
      }

      case "get_bank_transactions": {
        const { status, bank_account_name } = args as { status?: string; bank_account_name?: string };

        let query = supabase
          .from("bank_transactions")
          .select("*, bank_accounts(name, bank_name)")
          .eq("org_id", orgId)
          .order("transaction_date", { ascending: false })
          .limit(50);

        if (status) {
          query = query.eq("status", status);
        }

        const { data: transactions } = await query;

        let filtered = transactions || [];
        if (bank_account_name) {
          const searchLower = bank_account_name.toLowerCase();
          filtered = filtered.filter((t: any) =>
            t.bank_accounts?.name?.toLowerCase().includes(searchLower)
          );
        }

        return JSON.stringify({
          transactions: filtered.map((t: any) => ({
            id: t.id,
            transaction_date: t.transaction_date,
            description: t.description,
            amount: t.amount,
            bank_account: t.bank_accounts?.name,
            bank_name: t.bank_accounts?.bank_name,
            status: t.status,
            matched_invoice_id: t.matched_invoice_id,
            matched_bill_id: t.matched_bill_id,
          })),
          count: filtered.length,
        });
      }

      // ============ COLLECTIONS TOOLS ============
      case "get_collection_priority_list": {
        const { data: invoices } = await supabase
          .from("invoices")
          .select("*, customers(name, email)")
          .eq("org_id", orgId)
          .eq("status", "overdue")
          .order("due_date", { ascending: true });

        const today = new Date();
        const prioritized = (invoices || [])
          .map((inv: any) => {
            const daysOverdue = Math.floor((today.getTime() - new Date(inv.due_date).getTime()) / (1000 * 60 * 60 * 24));
            const amount = inv.total - inv.amount_paid;
            const priority = (daysOverdue * 2) + (amount / 100);
            return {
              invoice_number: inv.invoice_number,
              customer: inv.customers?.name,
              email: inv.customers?.email,
              amount,
              days_overdue: daysOverdue,
              priority_score: Math.round(priority),
              suggested_action: daysOverdue > 60 ? "Final Notice" : daysOverdue > 30 ? "Firm Reminder" : "Friendly Reminder",
            };
          })
          .sort((a: any, b: any) => b.priority_score - a.priority_score);

        return JSON.stringify({ priority_list: prioritized, count: prioritized.length });
      }

      case "draft_dunning_email": {
        const { customer_name, invoice_number, amount, days_overdue, escalation_level } = args as {
          customer_name: string;
          invoice_number?: string;
          amount: number;
          days_overdue: number;
          escalation_level: string;
        };

        const templates: Record<string, { subject: string; body: string }> = {
          friendly_reminder: {
            subject: `Payment Reminder - ${invoice_number ? `Invoice ${invoice_number}` : "Outstanding Balance"}`,
            body: `Dear ${customer_name},

I hope this message finds you well. This is a friendly reminder that ${invoice_number ? `invoice ${invoice_number} for` : "your balance of"} $${amount.toLocaleString()} is now ${days_overdue} days past due.

If you've already sent payment, please disregard this message. Otherwise, we'd appreciate your prompt attention.

Please reach out if you have any questions or need to discuss payment arrangements.

Best regards,
Accounts Receivable`,
          },
          firm_reminder: {
            subject: `Second Notice - ${invoice_number ? `Invoice ${invoice_number}` : "Outstanding Balance"} Past Due`,
            body: `Dear ${customer_name},

This is our second notice regarding ${invoice_number ? `invoice ${invoice_number} for` : "the outstanding balance of"} $${amount.toLocaleString()}, which is now ${days_overdue} days past due.

We request that you arrange payment at your earliest convenience. If there are issues with the invoice, please contact us immediately to resolve them.

Best regards,
Accounts Receivable`,
          },
          final_notice: {
            subject: `FINAL NOTICE - ${invoice_number ? `Invoice ${invoice_number}` : "Account"} Requires Immediate Attention`,
            body: `Dear ${customer_name},

This is our final notice regarding ${invoice_number ? `invoice ${invoice_number} for` : "the outstanding balance of"} $${amount.toLocaleString()}, which is ${days_overdue} days overdue.

Immediate payment is required within 7 days to avoid further collection actions.

Please contact us immediately if you need to discuss this matter.

Regards,
Collections Department`,
          },
          collections_warning: {
            subject: `URGENT: Account to be Referred to Collections`,
            body: `Dear ${customer_name},

Despite previous communications, ${invoice_number ? `invoice ${invoice_number} for` : "your account balance of"} $${amount.toLocaleString()} remains unpaid after ${days_overdue} days.

Unless we receive payment within 5 business days, this account will be referred to our collections agency.

Contact us immediately to avoid this action.

Collections Department`,
          },
        };

        const template = templates[escalation_level] || templates.friendly_reminder;
        return JSON.stringify({
          subject: template.subject,
          body: template.body,
          escalation_level,
          suggested_followup_days: escalation_level === "collections_warning" ? 5 : escalation_level === "final_notice" ? 7 : 14,
        });
      }

      case "get_customer_payment_history": {
        const { customer_name } = args as { customer_name: string };

        const { data: customers } = await supabase
          .from("customers")
          .select("id, name")
          .eq("org_id", orgId)
          .ilike("name", `%${customer_name}%`)
          .limit(1);

        if (!customers?.length) {
          return JSON.stringify({ error: "Customer not found", customer_name });
        }

        const customer = customers[0] as { id: string; name: string };
        const { data: invoices } = await supabase
          .from("invoices")
          .select("*")
          .eq("org_id", orgId)
          .eq("customer_id", customer.id)
          .order("issue_date", { ascending: false })
          .limit(10);

        const paidInvoices = (invoices || []).filter((i: any) => i.status === "paid");
        const overdueCount = (invoices || []).filter((i: any) => i.status === "overdue").length;

        return JSON.stringify({
          customer_name: customer.name,
          total_invoices: invoices?.length || 0,
          paid_invoices: paidInvoices.length,
          overdue_invoices: overdueCount,
          payment_reliability: overdueCount === 0 ? "excellent" : overdueCount <= 2 ? "good" : "at risk",
          recent_invoices: (invoices || []).slice(0, 5).map((i: any) => ({
            number: i.invoice_number,
            amount: i.total,
            status: i.status,
            due_date: i.due_date,
          })),
        });
      }

      case "suggest_collection_strategy": {
        const { customer_name, total_overdue, days_overdue } = args as {
          customer_name: string;
          total_overdue: number;
          days_overdue: number;
        };

        let strategy: string;
        let actions: string[];

        if (days_overdue <= 15) {
          strategy = "Early Stage - Friendly Outreach";
          actions = [
            "Send friendly payment reminder email",
            "Verify invoice was received correctly",
            "Offer to answer any questions about the invoice",
          ];
        } else if (days_overdue <= 30) {
          strategy = "Standard Collection";
          actions = [
            "Send firm reminder with payment deadline",
            "Make phone call to accounts payable",
            "Review customer for any disputes or issues",
          ];
        } else if (days_overdue <= 60) {
          strategy = "Escalated Collection";
          actions = [
            "Send final notice letter",
            "Escalate to customer's management",
            "Consider placing account on credit hold",
            "Review for potential bad debt reserve",
          ];
        } else {
          strategy = "Critical Collection";
          actions = [
            "Issue final demand letter",
            "Place account on credit hold immediately",
            "Consider third-party collection agency",
            "Evaluate for write-off if uncollectible",
          ];
        }

        return JSON.stringify({
          customer_name,
          total_overdue,
          days_overdue,
          recommended_strategy: strategy,
          action_items: actions,
          urgency: days_overdue > 60 ? "high" : days_overdue > 30 ? "medium" : "low",
        });
      }

      // ============ CLOSE ASSISTANT TOOLS ============
      case "get_close_status": {
        const period = (args as { period?: string }).period || new Date().toISOString().slice(0, 7);

        const { data: tasks } = await supabase
          .from("close_tasks")
          .select("*")
          .eq("org_id", orgId)
          .eq("period_id", period);

        const taskList = tasks || [];
        const completed = taskList.filter((t: any) => t.status === "complete").length;
        const inProgress = taskList.filter((t: any) => t.status === "in_progress").length;
        const pending = taskList.filter((t: any) => t.status === "pending").length;
        const overdue = taskList.filter((t: any) => t.status === "overdue").length;

        return JSON.stringify({
          period,
          progress_percentage: taskList.length > 0 ? Math.round((completed / taskList.length) * 100) : 0,
          summary: { completed, in_progress: inProgress, pending, overdue, total: taskList.length },
          status: completed === taskList.length ? "closed" : overdue > 0 ? "at_risk" : "on_track",
        });
      }

      case "get_close_tasks": {
        const { period, status } = args as { period?: string; status?: string };
        const periodId = period || new Date().toISOString().slice(0, 7);

        let query = supabase
          .from("close_tasks")
          .select("*")
          .eq("org_id", orgId)
          .eq("period_id", periodId);

        if (status) {
          query = query.eq("status", status);
        }

        const { data: tasks } = await query.order("due_date", { ascending: true });

        return JSON.stringify({
          period: periodId,
          tasks: (tasks || []).map((t: any) => ({
            name: t.name,
            description: t.description,
            status: t.status,
            due_date: t.due_date,
            assigned_to: t.assigned_to,
          })),
          count: tasks?.length || 0,
        });
      }

      case "get_close_blockers": {
        const period = (args as { period?: string }).period || new Date().toISOString().slice(0, 7);

        const { data: tasks } = await supabase
          .from("close_tasks")
          .select("*")
          .eq("org_id", orgId)
          .eq("period_id", period)
          .in("status", ["pending", "in_progress", "overdue"])
          .order("due_date", { ascending: true });

        const today = new Date();
        const blockers = (tasks || []).filter((t: any) => {
          return t.status === "overdue" || (t.due_date && new Date(t.due_date) < today);
        });

        return JSON.stringify({
          period,
          blockers: blockers.map((t: any) => ({
            name: t.name,
            status: t.status,
            due_date: t.due_date,
            impact: "Blocking period close",
          })),
          blocker_count: blockers.length,
          recommendation: blockers.length > 0 ? "Prioritize resolving these tasks to complete the close" : "No blockers identified",
        });
      }

      case "generate_close_report": {
        const period = (args as { period?: string }).period || new Date().toISOString().slice(0, 7);

        const statusResult = await executeToolCall("get_close_status", { period }, supabase, orgId);
        const blockersResult = await executeToolCall("get_close_blockers", { period }, supabase, orgId);
        const tasksResult = await executeToolCall("get_close_tasks", { period }, supabase, orgId);

        return JSON.stringify({
          report_title: `Period Close Report - ${period}`,
          generated_at: new Date().toISOString(),
          status: JSON.parse(statusResult),
          blockers: JSON.parse(blockersResult),
          all_tasks: JSON.parse(tasksResult),
        });
      }

      case "update_close_task": {
        const { task_name, status } = args as { task_name: string; status: string };

        const { data: tasks } = await supabase
          .from("close_tasks")
          .select("id, name")
          .eq("org_id", orgId)
          .ilike("name", `%${task_name}%`)
          .limit(1);

        if (!tasks?.length) {
          return JSON.stringify({ error: "Task not found", task_name });
        }

        const task = tasks[0] as { id: string; name: string };
        const { data, error } = await supabase
          .from("close_tasks")
          .update({
            status,
            completed_at: status === "complete" ? new Date().toISOString() : null,
          })
          .eq("id", task.id)
          .select()
          .single();

        if (error) {
          return JSON.stringify({ error: error.message });
        }

        return JSON.stringify({
          success: true,
          task: { name: data.name, status: data.status },
          message: `Task "${data.name}" updated to ${status}`,
        });
      }

      // ============ P2P TOOLS ============
      case "get_purchase_orders": {
        const { status, vendor_name } = args as { status?: string; vendor_name?: string };

        let query = supabase
          .from("purchase_orders")
          .select("*, vendors(name)")
          .eq("org_id", orgId)
          .order("order_date", { ascending: false })
          .limit(20);

        if (status) query = query.eq("status", status);

        const { data: pos } = await query;

        let filteredPOs = pos || [];
        if (vendor_name) {
          filteredPOs = filteredPOs.filter((po: any) => 
            po.vendors?.name?.toLowerCase().includes(vendor_name.toLowerCase())
          );
        }

        return JSON.stringify({
          purchase_orders: filteredPOs.map((po: any) => ({
            po_number: po.po_number,
            vendor: po.vendors?.name,
            order_date: po.order_date,
            expected_delivery: po.expected_delivery_date,
            status: po.status,
            total: po.total,
          })),
          count: filteredPOs.length,
        });
      }

      case "get_goods_receipts": {
        const { po_number } = args as { po_number?: string };

        let query = supabase
          .from("goods_receipts")
          .select("*, purchase_orders(po_number, vendors(name))")
          .eq("org_id", orgId)
          .order("receipt_date", { ascending: false })
          .limit(20);

        const { data: receipts } = await query;

        let filteredReceipts = receipts || [];
        if (po_number) {
          filteredReceipts = filteredReceipts.filter((gr: any) =>
            gr.purchase_orders?.po_number?.toLowerCase().includes(po_number.toLowerCase())
          );
        }

        return JSON.stringify({
          goods_receipts: filteredReceipts.map((gr: any) => ({
            receipt_number: gr.receipt_number,
            po_number: gr.purchase_orders?.po_number,
            vendor: gr.purchase_orders?.vendors?.name,
            receipt_date: gr.receipt_date,
            notes: gr.notes,
          })),
          count: filteredReceipts.length,
        });
      }

      case "get_bills_status": {
        const { status, vendor_name } = args as { status?: string; vendor_name?: string };

        let query = supabase
          .from("bills")
          .select("*, vendors(name), purchase_orders(po_number)")
          .eq("org_id", orgId)
          .order("due_date", { ascending: true })
          .limit(20);

        if (status) query = query.eq("status", status);

        const { data: bills } = await query;

        let filteredBills = bills || [];
        if (vendor_name) {
          filteredBills = filteredBills.filter((b: any) =>
            b.vendors?.name?.toLowerCase().includes(vendor_name.toLowerCase())
          );
        }

        return JSON.stringify({
          bills: filteredBills.map((b: any) => ({
            bill_number: b.bill_number,
            vendor: b.vendors?.name,
            po_number: b.purchase_orders?.po_number,
            issue_date: b.issue_date,
            due_date: b.due_date,
            total: b.total,
            amount_paid: b.amount_paid,
            balance: b.total - b.amount_paid,
            status: b.status,
            match_status: b.match_status,
          })),
          count: filteredBills.length,
        });
      }

      case "perform_three_way_match": {
        const { po_number } = args as { po_number: string };

        const { data: pos } = await supabase
          .from("purchase_orders")
          .select("*, vendors(name)")
          .eq("org_id", orgId)
          .ilike("po_number", `%${po_number}%`)
          .limit(1);

        if (!pos?.length) {
          return JSON.stringify({ error: "Purchase order not found", po_number });
        }

        const po = pos[0] as any;

        const { data: receipts } = await supabase
          .from("goods_receipts")
          .select("*")
          .eq("purchase_order_id", po.id);

        const { data: bills } = await supabase
          .from("bills")
          .select("*")
          .eq("purchase_order_id", po.id);

        const hasReceipt = (receipts?.length || 0) > 0;
        const hasBill = (bills?.length || 0) > 0;
        const billTotal = (bills || []).reduce((sum: number, b: any) => sum + Number(b.total), 0);

        let matchStatus = "unmatched";
        let issues: string[] = [];

        if (hasReceipt && hasBill) {
          if (Math.abs(billTotal - po.total) < 0.01) {
            matchStatus = "matched";
          } else {
            matchStatus = "variance";
            issues.push(`Bill amount ($${billTotal}) differs from PO amount ($${po.total})`);
          }
        } else {
          if (!hasReceipt) issues.push("No goods receipt found");
          if (!hasBill) issues.push("No bill found");
        }

        return JSON.stringify({
          po_number: po.po_number,
          vendor: po.vendors?.name,
          po_total: po.total,
          goods_receipts: receipts?.length || 0,
          bills_count: bills?.length || 0,
          bill_total: billTotal,
          match_status: matchStatus,
          issues,
          recommendation: matchStatus === "matched" 
            ? "Ready for payment" 
            : matchStatus === "variance" 
              ? "Review variance before payment" 
              : "Complete missing documents before processing",
        });
      }

      case "get_vendor_analysis": {
        const { vendor_name } = args as { vendor_name?: string };

        let vendorQuery = supabase
          .from("vendors")
          .select("*")
          .eq("org_id", orgId);

        if (vendor_name) {
          vendorQuery = vendorQuery.ilike("name", `%${vendor_name}%`);
        }

        const { data: vendors } = await vendorQuery.limit(10);

        const vendorAnalysis = await Promise.all((vendors || []).map(async (v: any) => {
          const { data: bills } = await supabase
            .from("bills")
            .select("total, amount_paid, status, due_date")
            .eq("vendor_id", v.id);

          const totalSpend = (bills || []).reduce((sum: number, b: any) => sum + Number(b.total), 0);
          const pendingPayment = (bills || [])
            .filter((b: any) => b.status !== "paid")
            .reduce((sum: number, b: any) => sum + (Number(b.total) - Number(b.amount_paid)), 0);

          return {
            name: v.name,
            email: v.email,
            payment_terms: v.payment_terms,
            total_spend: totalSpend,
            pending_payment: pendingPayment,
            bill_count: bills?.length || 0,
          };
        }));

        return JSON.stringify({
          vendors: vendorAnalysis.sort((a, b) => b.total_spend - a.total_spend),
          count: vendorAnalysis.length,
        });
      }

      case "get_payment_runs": {
        const { status } = args as { status?: string };

        let query = supabase
          .from("payment_runs")
          .select("*, bank_accounts(name)")
          .eq("org_id", orgId)
          .order("run_date", { ascending: false })
          .limit(20);

        if (status) query = query.eq("status", status);

        const { data: runs } = await query;

        return JSON.stringify({
          payment_runs: (runs || []).map((r: any) => ({
            run_number: r.run_number,
            run_date: r.run_date,
            status: r.status,
            total_amount: r.total_amount,
            payment_method: r.payment_method,
            bank_account: r.bank_accounts?.name,
          })),
          count: runs?.length || 0,
        });
      }

      case "get_bills_due_for_payment": {
        const { days_ahead = 7 } = args as { days_ahead?: number };

        const today = new Date();
        const futureDate = new Date(today.getTime() + days_ahead * 24 * 60 * 60 * 1000);

        const { data: bills } = await supabase
          .from("bills")
          .select("*, vendors(name)")
          .eq("org_id", orgId)
          .in("status", ["pending", "overdue"])
          .lte("due_date", futureDate.toISOString().split("T")[0])
          .order("due_date", { ascending: true });

        const totalDue = (bills || []).reduce((sum: number, b: any) => 
          sum + (Number(b.total) - Number(b.amount_paid)), 0
        );

        return JSON.stringify({
          bills_due: (bills || []).map((b: any) => ({
            bill_number: b.bill_number,
            vendor: b.vendors?.name,
            due_date: b.due_date,
            amount_due: b.total - b.amount_paid,
            status: b.status,
          })),
          count: bills?.length || 0,
          total_due: totalDue,
          days_ahead,
        });
      }

      case "get_p2p_cycle_summary": {
        const [posResult, grResult, billsResult, runsResult] = await Promise.all([
          supabase.from("purchase_orders").select("status, total").eq("org_id", orgId),
          supabase.from("goods_receipts").select("id").eq("org_id", orgId),
          supabase.from("bills").select("status, total, amount_paid").eq("org_id", orgId),
          supabase.from("payment_runs").select("status, total_amount").eq("org_id", orgId),
        ]);

        const pos = posResult.data || [];
        const bills = billsResult.data || [];
        const runs = runsResult.data || [];

        const posByStatus: Record<string, number> = {};
        pos.forEach((po: any) => {
          posByStatus[po.status] = (posByStatus[po.status] || 0) + 1;
        });

        const billsByStatus: Record<string, number> = {};
        bills.forEach((b: any) => {
          billsByStatus[b.status] = (billsByStatus[b.status] || 0) + 1;
        });

        const totalPOValue = pos.reduce((sum: number, po: any) => sum + Number(po.total), 0);
        const totalBillValue = bills.reduce((sum: number, b: any) => sum + Number(b.total), 0);
        const totalPaid = bills.reduce((sum: number, b: any) => sum + Number(b.amount_paid), 0);

        return JSON.stringify({
          purchase_orders: {
            total: pos.length,
            by_status: posByStatus,
            total_value: totalPOValue,
          },
          goods_receipts: {
            total: grResult.data?.length || 0,
          },
          bills: {
            total: bills.length,
            by_status: billsByStatus,
            total_value: totalBillValue,
            total_paid: totalPaid,
            outstanding: totalBillValue - totalPaid,
          },
          payment_runs: {
            total: runs.length,
            total_processed: runs
              .filter((r: any) => r.status === "completed")
              .reduce((sum: number, r: any) => sum + Number(r.total_amount), 0),
          },
        });
      }

      // ============ O2C TOOLS - QUOTATIONS ============
      case "get_quotations": {
        const { status, customer_name } = args as { status?: string; customer_name?: string };

        let query = supabase
          .from("quotations")
          .select("*, customers(name)")
          .eq("org_id", orgId)
          .order("quote_date", { ascending: false })
          .limit(50);

        if (status) {
          query = query.eq("status", status);
        }

        const { data: quotations } = await query;

        let filtered = quotations || [];
        if (customer_name) {
          const searchLower = customer_name.toLowerCase();
          filtered = filtered.filter((q: any) =>
            q.customers?.name?.toLowerCase().includes(searchLower)
          );
        }

        return JSON.stringify({
          quotations: filtered.map((q: any) => ({
            quote_number: q.quote_number,
            customer: q.customers?.name,
            quote_date: q.quote_date,
            valid_until: q.valid_until,
            subtotal: q.subtotal,
            tax: q.tax,
            total: q.total,
            status: q.status,
            converted_to_so: q.converted_so_id ? true : false,
          })),
          count: filtered.length,
          note: filtered.length === 0 ? "No quotations found." : undefined,
        });
      }

      case "get_quotation_summary": {
        const { data: quotations } = await supabase
          .from("quotations")
          .select("status, total")
          .eq("org_id", orgId);

        const stats = {
          total: 0,
          draft: { count: 0, value: 0 },
          sent: { count: 0, value: 0 },
          accepted: { count: 0, value: 0 },
          rejected: { count: 0, value: 0 },
          expired: { count: 0, value: 0 },
          converted: { count: 0, value: 0 },
        };

        (quotations || []).forEach((q: any) => {
          stats.total++;
          const status = q.status as keyof typeof stats;
          if (stats[status] && typeof stats[status] === 'object') {
            (stats[status] as { count: number; value: number }).count++;
            (stats[status] as { count: number; value: number }).value += Number(q.total) || 0;
          }
        });

        const conversionRate = stats.sent.count > 0 
          ? ((stats.accepted.count + stats.converted.count) / (stats.sent.count + stats.accepted.count + stats.rejected.count + stats.converted.count) * 100).toFixed(1)
          : 0;

        return JSON.stringify({
          total_quotations: stats.total,
          by_status: {
            draft: stats.draft,
            sent: stats.sent,
            accepted: stats.accepted,
            rejected: stats.rejected,
            expired: stats.expired,
            converted: stats.converted,
          },
          pipeline_value: stats.draft.value + stats.sent.value + stats.accepted.value,
          conversion_rate: `${conversionRate}%`,
        });
      }

      case "get_quotations_expiring_soon": {
        const days = (args as { days?: number }).days || 7;
        const today = new Date();
        const futureDate = new Date();
        futureDate.setDate(today.getDate() + days);

        const { data: quotations } = await supabase
          .from("quotations")
          .select("*, customers(name)")
          .eq("org_id", orgId)
          .in("status", ["draft", "sent"])
          .gte("valid_until", today.toISOString().split('T')[0])
          .lte("valid_until", futureDate.toISOString().split('T')[0])
          .order("valid_until", { ascending: true });

        return JSON.stringify({
          expiring_within_days: days,
          quotations: (quotations || []).map((q: any) => ({
            quote_number: q.quote_number,
            customer: q.customers?.name,
            total: q.total,
            valid_until: q.valid_until,
            status: q.status,
            days_until_expiry: Math.ceil((new Date(q.valid_until).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)),
          })),
          count: (quotations || []).length,
          recommendation: (quotations || []).length > 0 
            ? "Follow up with customers before these quotations expire" 
            : "No quotations expiring soon",
        });
      }

      // ============ O2C TOOLS - SALES ORDERS ============
      case "get_sales_orders": {
        const { status, customer_name } = args as { status?: string; customer_name?: string };

        let query = supabase
          .from("sales_orders")
          .select("*, customers(name)")
          .eq("org_id", orgId)
          .order("order_date", { ascending: false })
          .limit(20);

        if (status) query = query.eq("status", status);

        const { data: sos } = await query;

        let filteredSOs = sos || [];
        if (customer_name) {
          filteredSOs = filteredSOs.filter((so: any) =>
            so.customers?.name?.toLowerCase().includes(customer_name.toLowerCase())
          );
        }

        return JSON.stringify({
          sales_orders: filteredSOs.map((so: any) => ({
            so_number: so.so_number,
            customer: so.customers?.name,
            order_date: so.order_date,
            requested_delivery: so.requested_delivery_date,
            status: so.status,
            total: so.total,
          })),
          count: filteredSOs.length,
        });
      }

      case "get_shipments": {
        const { so_number } = args as { so_number?: string };

        let query = supabase
          .from("shipments")
          .select("*, sales_orders(so_number, customers(name))")
          .eq("org_id", orgId)
          .order("ship_date", { ascending: false })
          .limit(20);

        const { data: shipments } = await query;

        let filteredShipments = shipments || [];
        if (so_number) {
          filteredShipments = filteredShipments.filter((s: any) =>
            s.sales_orders?.so_number?.toLowerCase().includes(so_number.toLowerCase())
          );
        }

        return JSON.stringify({
          shipments: filteredShipments.map((s: any) => ({
            shipment_number: s.shipment_number,
            so_number: s.sales_orders?.so_number,
            customer: s.sales_orders?.customers?.name,
            ship_date: s.ship_date,
            carrier: s.carrier,
            tracking_number: s.tracking_number,
          })),
          count: filteredShipments.length,
        });
      }

      case "get_customer_invoices": {
        const { status, customer_name } = args as { status?: string; customer_name?: string };

        let query = supabase
          .from("invoices")
          .select("*, customers(name), sales_orders(so_number)")
          .eq("org_id", orgId)
          .order("issue_date", { ascending: false })
          .limit(20);

        if (status) query = query.eq("status", status);

        const { data: invoices } = await query;

        let filteredInvoices = invoices || [];
        if (customer_name) {
          filteredInvoices = filteredInvoices.filter((i: any) =>
            i.customers?.name?.toLowerCase().includes(customer_name.toLowerCase())
          );
        }

        return JSON.stringify({
          invoices: filteredInvoices.map((i: any) => ({
            invoice_number: i.invoice_number,
            customer: i.customers?.name,
            so_number: i.sales_orders?.so_number,
            issue_date: i.issue_date,
            due_date: i.due_date,
            total: i.total,
            amount_paid: i.amount_paid,
            balance: i.total - i.amount_paid,
            status: i.status,
          })),
          count: filteredInvoices.length,
        });
      }

      case "get_customer_analysis": {
        const { customer_name } = args as { customer_name?: string };

        let customerQuery = supabase
          .from("customers")
          .select("*")
          .eq("org_id", orgId);

        if (customer_name) {
          customerQuery = customerQuery.ilike("name", `%${customer_name}%`);
        }

        const { data: customers } = await customerQuery.limit(10);

        const customerAnalysis = await Promise.all((customers || []).map(async (c: any) => {
          const { data: invoices } = await supabase
            .from("invoices")
            .select("total, amount_paid, status, due_date")
            .eq("customer_id", c.id);

          const { data: orders } = await supabase
            .from("sales_orders")
            .select("total, status")
            .eq("customer_id", c.id);

          const totalRevenue = (invoices || [])
            .filter((i: any) => i.status === "paid")
            .reduce((sum: number, i: any) => sum + Number(i.total), 0);

          const outstandingAR = (invoices || [])
            .filter((i: any) => i.status !== "paid" && i.status !== "cancelled")
            .reduce((sum: number, i: any) => sum + (Number(i.total) - Number(i.amount_paid)), 0);

          const overdueCount = (invoices || []).filter((i: any) => i.status === "overdue").length;

          return {
            name: c.name,
            email: c.email,
            credit_limit: c.credit_limit,
            payment_terms: c.payment_terms,
            total_revenue: totalRevenue,
            outstanding_ar: outstandingAR,
            order_count: orders?.length || 0,
            invoice_count: invoices?.length || 0,
            overdue_invoices: overdueCount,
            health: overdueCount === 0 ? "good" : overdueCount <= 2 ? "moderate" : "at_risk",
          };
        }));

        return JSON.stringify({
          customers: customerAnalysis.sort((a, b) => b.total_revenue - a.total_revenue),
          count: customerAnalysis.length,
        });
      }

      case "get_o2c_cycle_summary": {
        const [sosResult, shipmentsResult, invoicesResult] = await Promise.all([
          supabase.from("sales_orders").select("status, total").eq("org_id", orgId),
          supabase.from("shipments").select("id").eq("org_id", orgId),
          supabase.from("invoices").select("status, total, amount_paid").eq("org_id", orgId),
        ]);

        const sos = sosResult.data || [];
        const invoices = invoicesResult.data || [];

        const sosByStatus: Record<string, number> = {};
        sos.forEach((so: any) => {
          sosByStatus[so.status] = (sosByStatus[so.status] || 0) + 1;
        });

        const invoicesByStatus: Record<string, number> = {};
        invoices.forEach((i: any) => {
          invoicesByStatus[i.status] = (invoicesByStatus[i.status] || 0) + 1;
        });

        const totalOrderValue = sos.reduce((sum: number, so: any) => sum + Number(so.total), 0);
        const totalInvoiced = invoices.reduce((sum: number, i: any) => sum + Number(i.total), 0);
        const totalCollected = invoices.reduce((sum: number, i: any) => sum + Number(i.amount_paid), 0);

        return JSON.stringify({
          sales_orders: {
            total: sos.length,
            by_status: sosByStatus,
            total_value: totalOrderValue,
          },
          shipments: {
            total: shipmentsResult.data?.length || 0,
          },
          invoices: {
            total: invoices.length,
            by_status: invoicesByStatus,
            total_invoiced: totalInvoiced,
            total_collected: totalCollected,
            outstanding_ar: totalInvoiced - totalCollected,
          },
          conversion_rate: totalOrderValue > 0 
            ? Math.round((totalInvoiced / totalOrderValue) * 100) 
            : 0,
          collection_rate: totalInvoiced > 0 
            ? Math.round((totalCollected / totalInvoiced) * 100) 
            : 0,
        });
      }

      case "get_orders_pending_shipment": {
        const { data: orders } = await supabase
          .from("sales_orders")
          .select("*, customers(name)")
          .eq("org_id", orgId)
          .eq("status", "approved")
          .order("requested_delivery_date", { ascending: true });

        return JSON.stringify({
          pending_shipment: (orders || []).map((so: any) => ({
            so_number: so.so_number,
            customer: so.customers?.name,
            order_date: so.order_date,
            requested_delivery: so.requested_delivery_date,
            total: so.total,
          })),
          count: orders?.length || 0,
        });
      }

      case "get_shipments_pending_invoice": {
        const { data: shipments } = await supabase
          .from("shipments")
          .select("*, sales_orders(so_number, total, customers(name))")
          .eq("org_id", orgId)
          .order("ship_date", { ascending: true });

        // Get invoices to check which shipments are already invoiced
        const { data: invoices } = await supabase
          .from("invoices")
          .select("shipment_id")
          .eq("org_id", orgId)
          .not("shipment_id", "is", null);

        const invoicedShipmentIds = new Set((invoices || []).map((i: any) => i.shipment_id));
        const pendingInvoice = (shipments || []).filter((s: any) => !invoicedShipmentIds.has(s.id));

        return JSON.stringify({
          pending_invoice: pendingInvoice.map((s: any) => ({
            shipment_number: s.shipment_number,
            so_number: s.sales_orders?.so_number,
            customer: s.sales_orders?.customers?.name,
            ship_date: s.ship_date,
            order_total: s.sales_orders?.total,
          })),
          count: pendingInvoice.length,
        });
      }

      case "get_revenue_pipeline": {
        const [ordersResult, invoicesResult] = await Promise.all([
          supabase.from("sales_orders").select("status, total").eq("org_id", orgId),
          supabase.from("invoices").select("status, total, amount_paid").eq("org_id", orgId),
        ]);

        const orders = ordersResult.data || [];
        const invoices = invoicesResult.data || [];

        const draftOrders = orders.filter((o: any) => o.status === "draft")
          .reduce((sum: number, o: any) => sum + Number(o.total), 0);
        const approvedOrders = orders.filter((o: any) => o.status === "approved")
          .reduce((sum: number, o: any) => sum + Number(o.total), 0);
        const shippedOrders = orders.filter((o: any) => o.status === "shipped")
          .reduce((sum: number, o: any) => sum + Number(o.total), 0);

        const draftInvoices = invoices.filter((i: any) => i.status === "draft")
          .reduce((sum: number, i: any) => sum + Number(i.total), 0);
        const sentInvoices = invoices.filter((i: any) => i.status === "sent")
          .reduce((sum: number, i: any) => sum + Number(i.total), 0);
        const overdueInvoices = invoices.filter((i: any) => i.status === "overdue")
          .reduce((sum: number, i: any) => sum + Number(i.total), 0);
        const collectedCash = invoices.reduce((sum: number, i: any) => sum + Number(i.amount_paid), 0);

        return JSON.stringify({
          pipeline: [
            { stage: "Draft Orders", value: draftOrders },
            { stage: "Approved (Pending Ship)", value: approvedOrders },
            { stage: "Shipped (Pending Invoice)", value: shippedOrders },
            { stage: "Draft Invoices", value: draftInvoices },
            { stage: "Sent (Awaiting Payment)", value: sentInvoices },
            { stage: "Overdue", value: overdueInvoices },
            { stage: "Cash Collected", value: collectedCash },
          ],
          total_pipeline: draftOrders + approvedOrders + shippedOrders + draftInvoices + sentInvoices + overdueInvoices,
          cash_collected: collectedCash,
        });
      }

      // ============ INVENTORY TOOLS ============
      case "get_warehouses": {
        const { data: warehouses } = await supabase
          .from("warehouses")
          .select("*")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .order("name");

        return JSON.stringify({
          warehouses: (warehouses || []).map((w: any) => ({
            id: w.id,
            code: w.code,
            name: w.name,
            address: w.address,
          })),
          count: (warehouses || []).length,
        });
      }

      case "get_products": {
        let query = supabase
          .from("products")
          .select("*")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .order("name");

        const search = args.search as string | undefined;
        if (search) {
          query = query.or(`sku.ilike.%${search}%,name.ilike.%${search}%`);
        }

        const { data: products } = await query;

        return JSON.stringify({
          products: (products || []).map((p: any) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            unit_of_measure: p.unit_of_measure,
            valuation_method: p.valuation_method,
            standard_cost: p.standard_cost,
            reorder_point: p.reorder_point,
            reorder_quantity: p.reorder_quantity,
            is_serialized: p.is_serialized,
            is_batch_tracked: p.is_batch_tracked,
          })),
          count: (products || []).length,
        });
      }

      case "get_inventory_stock": {
        const { data: stock } = await supabase
          .from("inventory_stock")
          .select(`
            *,
            products(sku, name, reorder_point),
            warehouses(code, name)
          `)
          .eq("org_id", orgId);

        let filteredStock = stock || [];
        const warehouseName = args.warehouse_name as string | undefined;
        const productSku = args.product_sku as string | undefined;

        if (warehouseName) {
          filteredStock = filteredStock.filter((s: any) => 
            s.warehouses?.name?.toLowerCase().includes(warehouseName.toLowerCase())
          );
        }
        if (productSku) {
          filteredStock = filteredStock.filter((s: any) => 
            s.products?.sku?.toLowerCase().includes(productSku.toLowerCase())
          );
        }

        return JSON.stringify({
          stock: filteredStock.map((s: any) => ({
            sku: s.products?.sku,
            product: s.products?.name,
            warehouse: s.warehouses?.name,
            quantity_on_hand: s.quantity_on_hand,
            quantity_reserved: s.quantity_reserved,
            quantity_available: s.quantity_available,
            unit_cost: s.unit_cost,
            total_value: s.total_value,
            reorder_point: s.products?.reorder_point,
            is_low_stock: s.products?.reorder_point && s.quantity_on_hand <= s.products.reorder_point,
          })),
          count: filteredStock.length,
        });
      }

      case "get_low_stock_alerts": {
        const { data: stock } = await supabase
          .from("inventory_stock")
          .select(`
            *,
            products(sku, name, reorder_point, reorder_quantity),
            warehouses(code, name)
          `)
          .eq("org_id", orgId);

        const lowStock = (stock || []).filter((s: any) => 
          s.products?.reorder_point && Number(s.quantity_on_hand) <= Number(s.products.reorder_point)
        );

        return JSON.stringify({
          low_stock_items: lowStock.map((s: any) => ({
            sku: s.products?.sku,
            product: s.products?.name,
            warehouse: s.warehouses?.name,
            current_quantity: s.quantity_on_hand,
            reorder_point: s.products?.reorder_point,
            suggested_order_qty: s.products?.reorder_quantity,
            shortage: s.products.reorder_point - s.quantity_on_hand,
          })),
          count: lowStock.length,
          requires_action: lowStock.length > 0,
        });
      }

      case "get_stock_transfers": {
        let query = supabase
          .from("stock_transfers")
          .select(`
            *,
            from_warehouse:warehouses!stock_transfers_from_warehouse_id_fkey(code, name),
            to_warehouse:warehouses!stock_transfers_to_warehouse_id_fkey(code, name)
          `)
          .eq("org_id", orgId)
          .order("created_at", { ascending: false });

        const status = args.status as string | undefined;
        if (status) {
          query = query.eq("status", status);
        }

        const { data: transfers } = await query;

        return JSON.stringify({
          transfers: (transfers || []).map((t: any) => ({
            transfer_number: t.transfer_number,
            from_warehouse: t.from_warehouse?.name,
            to_warehouse: t.to_warehouse?.name,
            status: t.status,
            transfer_date: t.transfer_date,
            expected_arrival: t.expected_arrival_date,
          })),
          count: (transfers || []).length,
        });
      }

      case "get_cycle_counts": {
        let query = supabase
          .from("cycle_counts")
          .select(`*, warehouses(code, name)`)
          .eq("org_id", orgId)
          .order("scheduled_date", { ascending: false });

        const status = args.status as string | undefined;
        if (status) {
          query = query.eq("status", status);
        }

        const { data: counts } = await query;

        return JSON.stringify({
          cycle_counts: (counts || []).map((c: any) => ({
            count_number: c.count_number,
            warehouse: c.warehouses?.name,
            status: c.status,
            scheduled_date: c.scheduled_date,
            started_at: c.started_at,
            completed_at: c.completed_at,
          })),
          count: (counts || []).length,
        });
      }

      case "get_inventory_valuation": {
        const { data: stock } = await supabase
          .from("inventory_stock")
          .select(`*, warehouses(code, name)`)
          .eq("org_id", orgId);

        const byWarehouse: Record<string, { name: string; total_value: number; item_count: number }> = {};
        let totalValue = 0;

        (stock || []).forEach((s: any) => {
          const whName = s.warehouses?.name || "Unknown";
          if (!byWarehouse[whName]) {
            byWarehouse[whName] = { name: whName, total_value: 0, item_count: 0 };
          }
          byWarehouse[whName].total_value += Number(s.total_value || 0);
          byWarehouse[whName].item_count += Number(s.quantity_on_hand || 0);
          totalValue += Number(s.total_value || 0);
        });

        return JSON.stringify({
          total_inventory_value: totalValue,
          by_warehouse: Object.values(byWarehouse),
          warehouse_count: Object.keys(byWarehouse).length,
        });
      }

      case "get_serial_numbers": {
        let query = supabase
          .from("serial_numbers")
          .select(`*, products(sku, name), warehouses(name)`)
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(50);

        const productSku = args.product_sku as string | undefined;
        const status = args.status as string | undefined;

        const { data: serials } = await query;

        let filtered = serials || [];
        if (productSku) {
          filtered = filtered.filter((s: any) => 
            s.products?.sku?.toLowerCase().includes(productSku.toLowerCase())
          );
        }
        if (status) {
          filtered = filtered.filter((s: any) => s.status === status);
        }

        return JSON.stringify({
          serial_numbers: filtered.map((s: any) => ({
            serial_number: s.serial_number,
            product_sku: s.products?.sku,
            product_name: s.products?.name,
            warehouse: s.warehouses?.name,
            status: s.status,
          })),
          count: filtered.length,
        });
      }

      case "get_batch_lots": {
        const { data: batches } = await supabase
          .from("batch_lots")
          .select(`*, products(sku, name), warehouses(name)`)
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(50);

        let filtered = batches || [];
        const productSku = args.product_sku as string | undefined;
        const expiringDays = args.expiring_within_days as number | undefined;

        if (productSku) {
          filtered = filtered.filter((b: any) => 
            b.products?.sku?.toLowerCase().includes(productSku.toLowerCase())
          );
        }

        if (expiringDays) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() + expiringDays);
          filtered = filtered.filter((b: any) => 
            b.expiry_date && new Date(b.expiry_date) <= cutoffDate
          );
        }

        return JSON.stringify({
          batch_lots: filtered.map((b: any) => ({
            batch_number: b.batch_number,
            product_sku: b.products?.sku,
            product_name: b.products?.name,
            warehouse: b.warehouses?.name,
            quantity: b.quantity,
            manufacture_date: b.manufacture_date,
            expiry_date: b.expiry_date,
            status: b.status,
          })),
          count: filtered.length,
        });
      }

      case "get_inventory_summary": {
        const [stockResult, productsResult, warehousesResult, transfersResult] = await Promise.all([
          supabase.from("inventory_stock").select("quantity_on_hand, total_value, products(reorder_point)").eq("org_id", orgId),
          supabase.from("products").select("id").eq("org_id", orgId).eq("is_active", true),
          supabase.from("warehouses").select("id").eq("org_id", orgId).eq("is_active", true),
          supabase.from("stock_transfers").select("id, status").eq("org_id", orgId),
        ]);

        const stock = stockResult.data || [];
        const totalValue = stock.reduce((sum: number, s: any) => sum + Number(s.total_value || 0), 0);
        const totalItems = stock.reduce((sum: number, s: any) => sum + Number(s.quantity_on_hand || 0), 0);
        const lowStockCount = stock.filter((s: any) => 
          s.products?.reorder_point && Number(s.quantity_on_hand) <= Number(s.products.reorder_point)
        ).length;

        const transfers = transfersResult.data || [];
        const pendingTransfers = transfers.filter((t: any) => 
          t.status === "pending" || t.status === "in_transit"
        ).length;

        return JSON.stringify({
          total_inventory_value: totalValue,
          total_items_in_stock: totalItems,
          low_stock_alerts: lowStockCount,
          pending_transfers: pendingTransfers,
          warehouse_count: (warehousesResult.data || []).length,
          product_count: (productsResult.data || []).length,
        });
      }

      // ============ INVENTORY P2P/O2C INTEGRATION TOOLS ============
      
      case "get_pending_purchase_orders": {
        const { data: pos } = await supabase
          .from("purchase_orders")
          .select(`
            id, po_number, order_date, expected_delivery_date, status, total,
            purchase_order_lines(description, quantity, received_quantity, unit_price),
            vendors(name)
          `)
          .eq("org_id", orgId)
          .in("status", ["approved", "partially_received"])
          .order("expected_delivery_date", { ascending: true });
        
        return JSON.stringify({
          pending_pos: (pos || []).map((po: any) => {
            const lines = po.purchase_order_lines || [];
            const totalOrdered = lines.reduce((sum: number, l: any) => sum + Number(l.quantity || 0), 0);
            const totalReceived = lines.reduce((sum: number, l: any) => sum + Number(l.received_quantity || 0), 0);
            
            return {
              po_number: po.po_number,
              vendor: po.vendors?.name,
              status: po.status,
              order_date: po.order_date,
              expected_delivery: po.expected_delivery_date,
              total_ordered: totalOrdered,
              total_received: totalReceived,
              pending_qty: totalOrdered - totalReceived,
              value: po.total,
            };
          }),
          count: (pos || []).length,
          summary: `${(pos || []).length} POs pending receipt will add inventory when goods arrive.`,
        });
      }

      case "get_recent_goods_receipts": {
        const days = (args.days as number) || 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const { data: receipts } = await supabase
          .from("goods_receipts")
          .select(`
            id, receipt_number, receipt_date, notes,
            purchase_orders(po_number, vendors(name)),
            goods_receipt_lines(quantity_received)
          `)
          .eq("org_id", orgId)
          .gte("receipt_date", cutoffDate.toISOString().split("T")[0])
          .order("receipt_date", { ascending: false });
        
        return JSON.stringify({
          recent_receipts: (receipts || []).map((gr: any) => ({
            receipt_number: gr.receipt_number,
            receipt_date: gr.receipt_date,
            po_number: gr.purchase_orders?.po_number,
            vendor: gr.purchase_orders?.vendors?.name,
            items_received: (gr.goods_receipt_lines || []).length,
            total_quantity: (gr.goods_receipt_lines || []).reduce((sum: number, l: any) => sum + Number(l.quantity_received || 0), 0),
          })),
          count: (receipts || []).length,
          period: `Last ${days} days`,
        });
      }

      case "get_pending_sales_orders": {
        const { data: orders } = await supabase
          .from("sales_orders")
          .select(`
            id, so_number, order_date, requested_delivery_date, status, total,
            sales_order_lines(description, quantity, shipped_quantity),
            customers(name)
          `)
          .eq("org_id", orgId)
          .in("status", ["confirmed", "approved", "partially_shipped"])
          .order("requested_delivery_date", { ascending: true });
        
        return JSON.stringify({
          pending_orders: (orders || []).map((so: any) => {
            const lines = so.sales_order_lines || [];
            const totalOrdered = lines.reduce((sum: number, l: any) => sum + Number(l.quantity || 0), 0);
            const totalShipped = lines.reduce((sum: number, l: any) => sum + Number(l.shipped_quantity || 0), 0);
            
            return {
              so_number: so.so_number,
              customer: so.customers?.name,
              status: so.status,
              order_date: so.order_date,
              requested_delivery: so.requested_delivery_date,
              total_ordered: totalOrdered,
              total_shipped: totalShipped,
              pending_qty: totalOrdered - totalShipped,
              value: so.total,
            };
          }),
          count: (orders || []).length,
          summary: `${(orders || []).length} orders pending shipment will reduce inventory when shipped.`,
        });
      }

      case "get_recent_shipments": {
        const days = (args.days as number) || 30;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        const { data: shipments } = await supabase
          .from("shipments")
          .select(`
            id, shipment_number, ship_date, carrier, tracking_number,
            sales_orders(so_number, customers(name)),
            shipment_lines(quantity_shipped)
          `)
          .eq("org_id", orgId)
          .gte("ship_date", cutoffDate.toISOString().split("T")[0])
          .order("ship_date", { ascending: false });
        
        return JSON.stringify({
          recent_shipments: (shipments || []).map((s: any) => ({
            shipment_number: s.shipment_number,
            ship_date: s.ship_date,
            so_number: s.sales_orders?.so_number,
            customer: s.sales_orders?.customers?.name,
            carrier: s.carrier,
            tracking: s.tracking_number,
            items_shipped: (s.shipment_lines || []).length,
            total_quantity: (s.shipment_lines || []).reduce((sum: number, l: any) => sum + Number(l.quantity_shipped || 0), 0),
          })),
          count: (shipments || []).length,
          period: `Last ${days} days`,
        });
      }

      case "get_inventory_demand_forecast": {
        // Get current stock
        const { data: stock } = await supabase
          .from("inventory_stock")
          .select(`
            quantity_on_hand, quantity_available, quantity_reserved,
            products(id, sku, name, reorder_point, reorder_quantity)
          `)
          .eq("org_id", orgId);
        
        // Get pending sales orders (demand)
        const { data: pendingSOs } = await supabase
          .from("sales_orders")
          .select(`
            sales_order_lines(quantity, shipped_quantity)
          `)
          .eq("org_id", orgId)
          .in("status", ["confirmed", "approved", "partially_shipped"]);
        
        // Get pending POs (supply)
        const { data: pendingPOs } = await supabase
          .from("purchase_orders")
          .select(`
            purchase_order_lines(quantity, received_quantity)
          `)
          .eq("org_id", orgId)
          .in("status", ["approved", "partially_received"]);
        
        // Calculate totals
        const totalOnHand = (stock || []).reduce((sum: number, s: any) => sum + Number(s.quantity_on_hand || 0), 0);
        const totalAvailable = (stock || []).reduce((sum: number, s: any) => sum + Number(s.quantity_available || 0), 0);
        
        let pendingDemand = 0;
        (pendingSOs || []).forEach((so: any) => {
          (so.sales_order_lines || []).forEach((l: any) => {
            pendingDemand += Number(l.quantity || 0) - Number(l.shipped_quantity || 0);
          });
        });
        
        let pendingSupply = 0;
        (pendingPOs || []).forEach((po: any) => {
          (po.purchase_order_lines || []).forEach((l: any) => {
            pendingSupply += Number(l.quantity || 0) - Number(l.received_quantity || 0);
          });
        });
        
        const lowStockItems = (stock || []).filter((s: any) => 
          s.products?.reorder_point && Number(s.quantity_available) <= Number(s.products.reorder_point)
        );
        
        return JSON.stringify({
          current_inventory: {
            total_on_hand: totalOnHand,
            total_available: totalAvailable,
            unique_products: (stock || []).length,
          },
          demand: {
            pending_order_quantity: pendingDemand,
            note: "Quantity needed for confirmed sales orders",
          },
          supply: {
            pending_receipt_quantity: pendingSupply,
            note: "Quantity coming from approved purchase orders",
          },
          net_position: {
            projected_available: totalAvailable - pendingDemand + pendingSupply,
            note: "Estimated available after fulfilling orders and receiving POs",
          },
          alerts: {
            low_stock_count: lowStockItems.length,
            items_need_reorder: lowStockItems.slice(0, 5).map((s: any) => ({
              sku: s.products?.sku,
              name: s.products?.name,
              available: s.quantity_available,
              reorder_point: s.products?.reorder_point,
              suggested_qty: s.products?.reorder_quantity,
            })),
          },
          recommendation: pendingDemand > totalAvailable 
            ? `Warning: Pending demand (${pendingDemand}) exceeds available stock (${totalAvailable}). Create purchase orders.`
            : lowStockItems.length > 0 
              ? `${lowStockItems.length} products below reorder point. Consider replenishment.`
              : "Inventory levels adequate for current demand.",
        });
      }

      // ============ CROSS-MODULE INTEGRATION TOOLS ============
      
      case "check_goods_receipt_inventory_impact": {
        const poNumber = args.po_number as string | undefined;
        
        // Get purchase orders matching the number
        let poQuery = supabase
          .from("purchase_orders")
          .select(`
            id, po_number, status, total,
            purchase_order_lines(description, quantity, unit_price),
            vendors(name)
          `)
          .eq("org_id", orgId);
        
        if (poNumber) {
          poQuery = poQuery.ilike("po_number", `%${poNumber}%`);
        }
        
        const { data: pos } = await poQuery.limit(5);
        
        // Get goods receipts for these POs
        const poIds = (pos || []).map((p: any) => p.id);
        const { data: receipts } = await supabase
          .from("goods_receipts")
          .select(`
            id, receipt_number, receipt_date,
            goods_receipt_lines(quantity_received, purchase_order_line_id)
          `)
          .in("purchase_order_id", poIds.length > 0 ? poIds : ["none"]);
        
        // Get current inventory for related products
        const { data: stock } = await supabase
          .from("inventory_stock")
          .select(`
            quantity_on_hand, quantity_available, unit_cost, total_value,
            products(sku, name),
            warehouses(name)
          `)
          .eq("org_id", orgId);
        
        return JSON.stringify({
          purchase_orders: (pos || []).map((po: any) => ({
            po_number: po.po_number,
            vendor: po.vendors?.name,
            status: po.status,
            line_count: (po.purchase_order_lines || []).length,
            total: po.total,
          })),
          goods_receipts: (receipts || []).map((gr: any) => ({
            receipt_number: gr.receipt_number,
            receipt_date: gr.receipt_date,
            items_received: (gr.goods_receipt_lines || []).length,
          })),
          current_stock_sample: (stock || []).slice(0, 10).map((s: any) => ({
            sku: s.products?.sku,
            product: s.products?.name,
            warehouse: s.warehouses?.name,
            on_hand: s.quantity_on_hand,
            available: s.quantity_available,
          })),
          summary: {
            pos_found: (pos || []).length,
            receipts_found: (receipts || []).length,
            note: "Goods receipts should trigger inventory additions. Check if stock levels reflect received quantities.",
          },
        });
      }

      case "check_order_fulfillment_status": {
        const soNumber = args.so_number as string | undefined;
        
        // Get sales orders
        let soQuery = supabase
          .from("sales_orders")
          .select(`
            id, so_number, status, total, customer_id,
            sales_order_lines(description, quantity, shipped_quantity),
            customers(name)
          `)
          .eq("org_id", orgId);
        
        if (soNumber) {
          soQuery = soQuery.ilike("so_number", `%${soNumber}%`);
        }
        
        const { data: orders } = await soQuery.limit(5);
        
        // Get current inventory
        const { data: stock } = await supabase
          .from("inventory_stock")
          .select(`
            quantity_on_hand, quantity_available, quantity_reserved,
            products(sku, name, reorder_point),
            warehouses(name)
          `)
          .eq("org_id", orgId);
        
        // Analyze fulfillment capability
        const fulfillmentAnalysis = (orders || []).map((so: any) => {
          const lines = so.sales_order_lines || [];
          const totalQty = lines.reduce((sum: number, l: any) => sum + Number(l.quantity || 0), 0);
          const shippedQty = lines.reduce((sum: number, l: any) => sum + Number(l.shipped_quantity || 0), 0);
          
          return {
            so_number: so.so_number,
            customer: so.customers?.name,
            status: so.status,
            total_lines: lines.length,
            total_quantity: totalQty,
            shipped_quantity: shippedQty,
            pending_quantity: totalQty - shippedQty,
            fulfillment_percentage: totalQty > 0 ? Math.round((shippedQty / totalQty) * 100) : 0,
          };
        });
        
        // Find low stock items
        const lowStockItems = (stock || []).filter((s: any) => 
          s.products?.reorder_point && Number(s.quantity_available) <= Number(s.products.reorder_point)
        );
        
        return JSON.stringify({
          orders: fulfillmentAnalysis,
          inventory_summary: {
            total_stock_items: (stock || []).length,
            low_stock_count: lowStockItems.length,
            low_stock_items: lowStockItems.slice(0, 5).map((s: any) => ({
              sku: s.products?.sku,
              name: s.products?.name,
              available: s.quantity_available,
              reorder_point: s.products?.reorder_point,
            })),
          },
          recommendation: lowStockItems.length > 0 
            ? `Warning: ${lowStockItems.length} products are below reorder point. Consider creating purchase orders.`
            : "Inventory levels appear adequate for current orders.",
        });
      }

      case "get_shipment_inventory_impact": {
        const shipmentNumber = args.shipment_number as string | undefined;
        
        // Get shipments
        let shipQuery = supabase
          .from("shipments")
          .select(`
            id, shipment_number, ship_date, carrier, tracking_number,
            sales_orders(so_number, customers(name)),
            shipment_lines(quantity_shipped, sales_order_line_id)
          `)
          .eq("org_id", orgId)
          .order("ship_date", { ascending: false });
        
        if (shipmentNumber) {
          shipQuery = shipQuery.ilike("shipment_number", `%${shipmentNumber}%`);
        }
        
        const { data: shipments } = await shipQuery.limit(10);
        
        // Get inventory transactions
        const { data: transactions } = await supabase
          .from("inventory_transactions")
          .select(`
            transaction_type, quantity, unit_cost, total_value, created_at,
            products(sku, name),
            warehouses(name)
          `)
          .eq("org_id", orgId)
          .order("created_at", { ascending: false })
          .limit(20);
        
        const outboundTransactions = (transactions || []).filter((t: any) => 
          t.transaction_type === "shipment" || t.transaction_type === "sale" || Number(t.quantity) < 0
        );
        
        return JSON.stringify({
          shipments: (shipments || []).map((s: any) => ({
            shipment_number: s.shipment_number,
            ship_date: s.ship_date,
            carrier: s.carrier,
            tracking: s.tracking_number,
            so_number: s.sales_orders?.so_number,
            customer: s.sales_orders?.customers?.name,
            lines_shipped: (s.shipment_lines || []).length,
            total_quantity: (s.shipment_lines || []).reduce((sum: number, l: any) => sum + Number(l.quantity_shipped || 0), 0),
          })),
          recent_outbound_transactions: outboundTransactions.slice(0, 10).map((t: any) => ({
            type: t.transaction_type,
            product: t.products?.name,
            warehouse: t.warehouses?.name,
            quantity: t.quantity,
            value: t.total_value,
            date: t.created_at,
          })),
          summary: {
            shipments_found: (shipments || []).length,
            note: "Shipments should reduce inventory. Verify outbound transactions match shipped quantities.",
          },
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);
    return JSON.stringify({ error: `Failed to execute ${toolName}: ${(error as Error).message}` });
  }
}

// ============================================================================
// AGENT ROUTING AND EXECUTION
// ============================================================================

async function routeToAgent(userMessage: string): Promise<string> {
  console.log("Routing message:", userMessage.substring(0, 100));

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAIApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: ROUTER_AGENT.model,
      messages: [
        { role: "system", content: ROUTER_AGENT.instructions },
        { role: "user", content: userMessage },
      ],
      max_tokens: 50,
    }),
  });

  const data = await response.json();
  const agentName = data.choices?.[0]?.message?.content?.trim().toLowerCase() || "bookkeeper_agent";

  console.log("Router selected agent:", agentName);

  if (["bookkeeper_agent", "collections_agent", "close_assistant_agent", "p2p_agent", "o2c_agent", "inventory_agent"].includes(agentName)) {
    return agentName;
  }
  return "bookkeeper_agent";
}

function getAgentConfig(agentName: string) {
  switch (agentName) {
    case "collections_agent":
      return COLLECTIONS_AGENT;
    case "close_assistant_agent":
      return CLOSE_ASSISTANT_AGENT;
    case "p2p_agent":
      return P2P_AGENT;
    case "o2c_agent":
      return O2C_AGENT;
    case "inventory_agent":
      return INVENTORY_AGENT;
    default:
      return BOOKKEEPER_AGENT;
  }
}

async function runAgent(
  agent: { name: string; model: string; instructions: string; tools: any[] },
  messages: Array<{ role: string; content: string }>,
  orgId: string,
  supabase: any
): Promise<{ response: string; toolCallsMade: number; agentUsed: string }> {
  let toolCallsMade = 0;

  const conversationMessages: any[] = [
    { role: "system", content: agent.instructions },
    ...messages,
  ];

  console.log(`Running agent: ${agent.name}`);

  let response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openAIApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: agent.model,
      messages: conversationMessages,
      tools: agent.tools,
      tool_choice: "auto",
      max_tokens: 2000,
    }),
  });

  let data = await response.json();
  let assistantMessage = data.choices?.[0]?.message;

  // Handle tool calls in a loop
  while (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
    conversationMessages.push(assistantMessage);

    for (const toolCall of assistantMessage.tool_calls) {
      const toolName = toolCall.function.name;
      const toolArgs = JSON.parse(toolCall.function.arguments || "{}");

      console.log(`Agent ${agent.name} calling tool: ${toolName}`);
      const toolResult = await executeToolCall(toolName, toolArgs, supabase, orgId);
      toolCallsMade++;

      // Log to audit table
      try {
        await supabase.from("ai_audit_logs").insert({
          org_id: orgId,
          agent_name: agent.name,
          model: agent.model,
          tool_name: toolName,
          input_data: toolArgs,
          output_data: JSON.parse(toolResult),
        });
      } catch (logError) {
        console.error("Failed to log AI audit:", logError);
      }

      conversationMessages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: toolResult,
      });
    }

    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openAIApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: agent.model,
        messages: conversationMessages,
        tools: agent.tools,
        tool_choice: "auto",
        max_tokens: 2000,
      }),
    });

    data = await response.json();
    assistantMessage = data.choices?.[0]?.message;
  }

  return {
    response: assistantMessage?.content || "I apologize, but I couldn't generate a response.",
    toolCallsMade,
    agentUsed: agent.name,
  };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages, org_id } = await req.json();

    if (!openAIApiKey) {
      throw new Error("OPENAI_API_KEY is not configured");
    }

    if (!org_id) {
      throw new Error("org_id is required");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the latest user message for routing
    const latestUserMessage = messages.filter((m: { role: string }) => m.role === "user").pop()?.content || "";

    // Route to appropriate agent
    const selectedAgent = await routeToAgent(latestUserMessage);
    const agentConfig = getAgentConfig(selectedAgent);

    // Run the selected agent
    const result = await runAgent(agentConfig, messages, org_id, supabase);

    console.log(`Response from ${result.agentUsed} with ${result.toolCallsMade} tool calls`);

    return new Response(
      JSON.stringify({
        response: result.response,
        tool_calls_made: result.toolCallsMade,
        agent_used: result.agentUsed,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Finance agents error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
