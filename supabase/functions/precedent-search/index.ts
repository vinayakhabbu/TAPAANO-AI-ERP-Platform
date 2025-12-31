import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PrecedentSearchRequest {
  org_id: string;
  query: string;
  decision_type?: string;
  limit?: number;
  use_vector?: boolean;
}

interface Precedent {
  decision_id: string;
  decision_type: string;
  similarity: number;
  input_snapshot: Record<string, unknown>;
  rationale_text: string | null;
  reason_codes?: string[];
  approval_status: string;
  created_at: string;
}

// Generate embedding using Lovable AI (OpenAI-compatible)
async function generateEmbedding(text: string): Promise<number[] | null> {
  const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openaiApiKey) {
    console.log("No OpenAI API key - falling back to text search");
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

// Build search context from decision snapshot
function buildSearchContext(snapshot: Record<string, unknown>): string {
  const parts: string[] = [];
  
  if (snapshot.vendor_name) parts.push(`vendor: ${snapshot.vendor_name}`);
  if (snapshot.customer_name) parts.push(`customer: ${snapshot.customer_name}`);
  if (snapshot.total) parts.push(`amount: $${snapshot.total}`);
  if (snapshot.status) parts.push(`status: ${snapshot.status}`);
  if (snapshot.po_number) parts.push(`PO: ${snapshot.po_number}`);
  if (snapshot.requisition_number) parts.push(`requisition: ${snapshot.requisition_number}`);
  if (snapshot.description) parts.push(String(snapshot.description));
  
  return parts.join(", ");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { org_id, query, decision_type, limit = 10, use_vector = true }: PrecedentSearchRequest = await req.json();

    if (!org_id || !query) {
      return new Response(
        JSON.stringify({ error: "org_id and query are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let precedents: Precedent[] = [];

    // Try vector search first if enabled
    if (use_vector) {
      const embedding = await generateEmbedding(query);
      
      if (embedding) {
        const { data, error } = await supabase.rpc("find_similar_precedents", {
          p_org_id: org_id,
          p_embedding: embedding,
          p_decision_type: decision_type || null,
          p_limit: limit,
          p_threshold: 0.5,
        });

        if (!error && data && data.length > 0) {
          precedents = data.map((p: any) => ({
            decision_id: p.decision_id,
            decision_type: p.decision_type,
            similarity: Math.round(p.similarity * 100) / 100,
            input_snapshot: p.input_snapshot,
            rationale_text: p.rationale_text,
            approval_status: p.approval_status,
            created_at: p.created_at,
          }));
        }
      }
    }

    // Fallback to text search if no vector results
    if (precedents.length === 0) {
      const { data, error } = await supabase.rpc("search_precedents_by_text", {
        p_org_id: org_id,
        p_search_text: query,
        p_decision_type: decision_type || null,
        p_limit: limit,
      });

      if (!error && data) {
        precedents = data.map((p: any) => ({
          decision_id: p.decision_id,
          decision_type: p.decision_type,
          similarity: Math.min(0.99, 0.5 + (p.relevance || 0) * 0.1),
          input_snapshot: p.input_snapshot,
          rationale_text: p.rationale_text,
          reason_codes: p.reason_codes,
          approval_status: p.approval_status,
          created_at: p.created_at,
        }));
      }
    }

    // Get additional context for each precedent
    const enrichedPrecedents = await Promise.all(
      precedents.map(async (p) => {
        const { data: entities } = await supabase
          .from("decision_entities")
          .select("entity_type, entity_id, entity_label")
          .eq("decision_id", p.decision_id)
          .limit(5);

        return {
          ...p,
          entities: entities || [],
          context_summary: buildSearchContext(p.input_snapshot),
        };
      })
    );

    return new Response(
      JSON.stringify({
        success: true,
        precedents: enrichedPrecedents,
        total: enrichedPrecedents.length,
        search_method: precedents.length > 0 && use_vector ? "vector" : "text",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Precedent search error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});