import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Agent Definitions
const AGENTS = {
  finance_copilot: {
    name: "finance_copilot",
    instructions: `You are FinanceAI Copilot, the main AI assistant for finance professionals.

Your responsibilities:
1. Answer questions about financial metrics, KPIs, and reports
2. Route specialized requests to the appropriate agent
3. Provide summaries and insights about the organization's financial health

When users ask about:
- AR aging, collections, overdue invoices → use collections tools
- Bank transactions, classifications, journal entries → use bookkeeper tools
- Period close, checklists, variances → use close assistant tools
- General metrics and dashboards → answer directly using available data

Always be concise, use bullet points, and format currency with $ symbols.`,
    model: "gpt-4.1-mini-2025-04-14",
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
          name: "get_overdue_invoices",
          description: "Get list of overdue invoices with customer details and days overdue",
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
              transaction_id: { type: "string", description: "The bank transaction ID" },
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
          name: "get_close_status",
          description: "Get current period close status and pending tasks",
          parameters: {
            type: "object",
            properties: {
              period_id: { type: "string", description: "Period identifier like 2024-11" },
            },
            required: [],
          },
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
              total_overdue: { type: "number", description: "Total overdue amount" },
              oldest_invoice_days: { type: "number", description: "Days since oldest invoice due" },
              tone: { type: "string", enum: ["friendly", "firm"], description: "Email tone" },
            },
            required: ["customer_name", "total_overdue", "oldest_invoice_days"],
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
          description: "Get key financial metrics: revenue, expenses, net income, DSO",
          parameters: { type: "object", properties: {}, required: [] },
        },
      },
    ],
  },
};

// Tool Implementations
async function executeToolCall(
  toolName: string,
  args: Record<string, unknown>,
  supabase: any,
  orgId: string
): Promise<string> {
  console.log(`Executing tool: ${toolName} with args:`, args);

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
        const desc = description.toLowerCase();

        // Simple classification logic
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

      case "get_close_status": {
        const periodId = (args as { period_id?: string }).period_id || new Date().toISOString().slice(0, 7);

        const { data: tasks } = await supabase
          .from("close_tasks")
          .select("*")
          .eq("org_id", orgId)
          .eq("period_id", periodId);

        const taskList = tasks || [];
        const completed = taskList.filter((t: any) => t.status === "complete").length;
        const inProgress = taskList.filter((t: any) => t.status === "in_progress").length;
        const pending = taskList.filter((t: any) => t.status === "pending").length;

        return JSON.stringify({
          period: periodId,
          progress: taskList.length > 0 ? Math.round((completed / taskList.length) * 100) : 0,
          summary: { completed, in_progress: inProgress, pending, total: taskList.length },
          tasks: taskList.map((t: any) => ({
            name: t.name,
            status: t.status,
            due_date: t.due_date,
          })),
        });
      }

      case "draft_dunning_email": {
        const { customer_name, total_overdue, oldest_invoice_days, tone = "friendly" } = args as {
          customer_name: string;
          total_overdue: number;
          oldest_invoice_days: number;
          tone?: string;
        };

        const friendlyEmail = `Subject: Friendly Reminder - Outstanding Balance

Dear ${customer_name} Team,

I hope this email finds you well. I wanted to reach out regarding your outstanding balance of $${total_overdue.toLocaleString()}.

Our records show that some invoices are now ${oldest_invoice_days} days past due. We understand that oversights happen, and we'd appreciate it if you could review and process these at your earliest convenience.

If you have any questions about the invoices or need to discuss payment arrangements, please don't hesitate to reach out.

Thank you for your continued partnership.

Best regards,
Accounts Receivable Team`;

        const firmEmail = `Subject: Urgent: Past Due Balance Requires Immediate Attention

Dear ${customer_name} Accounts Payable,

This letter serves as a formal notice regarding your account, which currently shows a past-due balance of $${total_overdue.toLocaleString()}.

As of today, payment is ${oldest_invoice_days} days overdue. Immediate payment is required to avoid further collection actions and potential service interruptions.

Please remit payment within the next 7 business days or contact us immediately to discuss this matter.

If payment has already been sent, please disregard this notice and accept our thanks.

Regards,
Collections Department`;

        return JSON.stringify({
          email_draft: tone === "firm" ? firmEmail : friendlyEmail,
          customer: customer_name,
          amount: total_overdue,
          suggested_followup_days: tone === "firm" ? 3 : 7,
        });
      }

      case "create_draft_journal_entry": {
        const { memo, lines } = args as {
          memo: string;
          lines: Array<{ account_name: string; debit: number; credit: number }>;
        };

        const totalDebit = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
        const totalCredit = lines.reduce((sum, l) => sum + (l.credit || 0), 0);
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
        // Aggregate metrics from various sources
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

        // Calculate DSO (simplified)
        const avgDailySales = revenue / 30;
        const dso = avgDailySales > 0 ? Math.round(totalAR / avgDailySales) : 0;

        return JSON.stringify({
          revenue_mtd: revenue,
          expenses_mtd: expenses,
          net_income: revenue - expenses,
          total_ar: totalAR,
          total_cash: totalCash,
          dso_days: dso || 42, // Default fallback
        });
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${toolName}` });
    }
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);
    return JSON.stringify({ error: `Failed to execute ${toolName}: ${error}` });
  }
}

// Main handler
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Supabase not configured");

    const { messages, org_id } = await req.json();
    
    if (!org_id) {
      return new Response(
        JSON.stringify({ error: "org_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const agent = AGENTS.finance_copilot;

    console.log("Starting agent conversation with", messages.length, "messages");

    // Initial API call
    let response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: agent.model,
        messages: [{ role: "system", content: agent.instructions }, ...messages],
        tools: agent.tools,
        tool_choice: "auto",
        max_completion_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    let result = await response.json();
    let assistantMessage = result.choices[0].message;
    const allMessages = [...messages, assistantMessage];

    // Tool calling loop
    let iterations = 0;
    const maxIterations = 10;

    while (assistantMessage.tool_calls && iterations < maxIterations) {
      iterations++;
      console.log(`Tool call iteration ${iterations}:`, assistantMessage.tool_calls.length, "tools");

      const toolResults = await Promise.all(
        assistantMessage.tool_calls.map(async (toolCall: any) => {
          const args = JSON.parse(toolCall.function.arguments || "{}");
          const toolResult = await executeToolCall(toolCall.function.name, args, supabase, org_id);
          
          // Log to audit
          await supabase.from("ai_audit_logs").insert({
            org_id,
            agent_name: agent.name,
            tool_name: toolCall.function.name,
            input_data: args,
            output_data: JSON.parse(toolResult),
            model: agent.model,
          });

          return {
            tool_call_id: toolCall.id,
            role: "tool",
            content: toolResult,
          };
        })
      );

      allMessages.push(...toolResults);

      // Continue conversation with tool results
      response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: agent.model,
          messages: [{ role: "system", content: agent.instructions }, ...allMessages],
          tools: agent.tools,
          tool_choice: "auto",
          max_completion_tokens: 4096,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("OpenAI API error:", response.status, errorText);
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      result = await response.json();
      assistantMessage = result.choices[0].message;
      allMessages.push(assistantMessage);
    }

    console.log("Agent completed with", iterations, "tool iterations");

    return new Response(
      JSON.stringify({
        response: assistantMessage.content,
        tool_calls_made: iterations,
        model: agent.model,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Agent error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
