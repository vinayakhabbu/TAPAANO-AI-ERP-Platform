import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmbeddingRequest {
  decision_trace_id: string;
}

// Build searchable text from decision trace data
function buildEmbeddingText(trace: Record<string, unknown>): string {
  const parts: string[] = [];
  
  // Decision type
  if (trace.decision_type) {
    parts.push(`decision: ${String(trace.decision_type).replace(/_/g, ' ')}`);
  }
  
  // Rationale
  if (trace.rationale_text) {
    parts.push(String(trace.rationale_text));
  }
  
  // Reason codes
  if (Array.isArray(trace.reason_codes) && trace.reason_codes.length > 0) {
    parts.push(`reasons: ${trace.reason_codes.join(', ')}`);
  }
  
  // Input snapshot fields
  const snapshot = trace.input_snapshot as Record<string, unknown> || {};
  
  if (snapshot.vendor_name) parts.push(`vendor: ${snapshot.vendor_name}`);
  if (snapshot.customer_name) parts.push(`customer: ${snapshot.customer_name}`);
  if (snapshot.employee_name) parts.push(`employee: ${snapshot.employee_name}`);
  if (snapshot.total) parts.push(`amount: $${snapshot.total}`);
  if (snapshot.amount) parts.push(`amount: $${snapshot.amount}`);
  if (snapshot.status) parts.push(`status: ${snapshot.status}`);
  if (snapshot.po_number) parts.push(`PO: ${snapshot.po_number}`);
  if (snapshot.requisition_number) parts.push(`requisition: ${snapshot.requisition_number}`);
  if (snapshot.invoice_number) parts.push(`invoice: ${snapshot.invoice_number}`);
  if (snapshot.quotation_number) parts.push(`quotation: ${snapshot.quotation_number}`);
  if (snapshot.order_number) parts.push(`order: ${snapshot.order_number}`);
  if (snapshot.description) parts.push(String(snapshot.description));
  if (snapshot.notes) parts.push(String(snapshot.notes));
  if (snapshot.reason) parts.push(`reason: ${snapshot.reason}`);
  if (snapshot.category) parts.push(`category: ${snapshot.category}`);
  if (snapshot.product_name) parts.push(`product: ${snapshot.product_name}`);
  if (snapshot.warehouse_name) parts.push(`warehouse: ${snapshot.warehouse_name}`);
  if (snapshot.opportunity_name) parts.push(`opportunity: ${snapshot.opportunity_name}`);
  if (snapshot.stage) parts.push(`stage: ${snapshot.stage}`);
  
  // Approval status
  if (trace.approval_status) {
    parts.push(`outcome: ${trace.approval_status}`);
  }
  
  return parts.join('. ');
}

// Generate embedding using OpenAI API
async function generateEmbedding(text: string): Promise<number[] | null> {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    console.log("No OpenAI API key configured - cannot generate embeddings");
    return null;
  }

  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
        dimensions: 1536,
      }),
    });

    if (!response.ok) {
      console.error("Embedding API error:", await response.text());
      return null;
    }

    const data = await response.json();
    return data.data[0].embedding;
  } catch (error) {
    console.error("Failed to generate embedding:", error);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { decision_trace_id }: EmbeddingRequest = await req.json();

    if (!decision_trace_id) {
      return new Response(
        JSON.stringify({ error: "decision_trace_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Generating embedding for decision trace:", decision_trace_id);

    // Fetch the decision trace
    const { data: trace, error: fetchError } = await supabase
      .from("decision_traces")
      .select("*")
      .eq("id", decision_trace_id)
      .single();

    if (fetchError || !trace) {
      console.error("Failed to fetch decision trace:", fetchError);
      return new Response(
        JSON.stringify({ error: "Decision trace not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build text for embedding
    const embeddingText = buildEmbeddingText(trace);
    console.log("Embedding text:", embeddingText.substring(0, 200) + "...");

    // Generate embedding
    const embedding = await generateEmbedding(embeddingText);

    if (!embedding) {
      return new Response(
        JSON.stringify({ success: false, message: "Failed to generate embedding (no API key or API error)" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update the decision trace with the embedding
    const { error: updateError } = await supabase
      .from("decision_traces")
      .update({ 
        context_embedding: `[${embedding.join(',')}]` 
      })
      .eq("id", decision_trace_id);

    if (updateError) {
      console.error("Failed to update embedding:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save embedding" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Embedding generated and saved successfully for:", decision_trace_id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        decision_trace_id,
        embedding_length: embedding.length 
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Generate embedding error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
