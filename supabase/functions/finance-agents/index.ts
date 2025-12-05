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

Route based on intent:
- Questions about money owed TO the company, aging, overdue invoices, collection emails → collections_agent
- Questions about period close, month-end, reconciliation, close tasks → close_assistant_agent
- Everything else (metrics, AP, cash, transactions, journal entries) → bookkeeper_agent

Respond with ONLY the agent name: "bookkeeper_agent", "collections_agent", or "close_assistant_agent"`,
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

      // Collections Agent Tools
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

      // Close Assistant Agent Tools
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

  if (["bookkeeper_agent", "collections_agent", "close_assistant_agent"].includes(agentName)) {
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
