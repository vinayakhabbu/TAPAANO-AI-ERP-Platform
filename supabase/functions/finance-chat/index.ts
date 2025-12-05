import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are FinanceAI Copilot, an expert AI assistant for finance professionals. You help with:

1. **Financial Metrics & Reports**: Answer questions about revenue, expenses, net income, DSO, cash flow, and other KPIs.

2. **Accounts Receivable (AR)**: Help with AR aging analysis, collections prioritization, drafting dunning emails, and customer payment tracking.

3. **Accounts Payable (AP)**: Assist with bill management, vendor payments, and expense categorization.

4. **General Ledger (GL)**: Help with journal entries, account classifications, and trial balance questions.

5. **Bank Reconciliation**: Assist with matching transactions, identifying discrepancies, and categorizing bank entries.

6. **Period Close**: Guide through month-end close checklists, track progress, and summarize close activities.

Guidelines:
- Be concise and actionable in your responses
- Use bullet points for lists and structured data
- When providing financial data, format numbers clearly with currency symbols
- For collections, always prioritize by amount and days overdue
- Never make up specific numbers - if you don't have real data, explain what information would be needed
- When suggesting journal entries, always show debits and credits clearly
- For period close tasks, provide clear status updates and next steps

You can help users with natural language queries like:
- "Show me AR aging summary"
- "What's our DSO this month?"
- "Start close for November"
- "Draft collection emails for overdue invoices"
- "Explain the variance in expenses this month"`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { messages } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log("Processing chat request with", messages.length, "messages");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: "Failed to get AI response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Streaming response from AI gateway");

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (error) {
    console.error("Finance chat error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
