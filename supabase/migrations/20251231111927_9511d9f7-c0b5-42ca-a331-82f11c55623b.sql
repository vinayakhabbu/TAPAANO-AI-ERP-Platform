-- Enable pgvector extension for semantic search
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to decision_traces for vector search
ALTER TABLE public.decision_traces 
ADD COLUMN IF NOT EXISTS context_embedding vector(1536),
ADD COLUMN IF NOT EXISTS precedents_referenced jsonb DEFAULT '[]'::jsonb;

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS idx_decision_traces_embedding 
ON public.decision_traces 
USING ivfflat (context_embedding vector_cosine_ops)
WITH (lists = 100);

-- Create index for faster precedent lookups
CREATE INDEX IF NOT EXISTS idx_decision_traces_type_status 
ON public.decision_traces (org_id, decision_type, approval_status);

-- Function to find similar precedents using vector similarity
CREATE OR REPLACE FUNCTION find_similar_precedents(
  p_org_id uuid,
  p_embedding vector(1536),
  p_decision_type text DEFAULT NULL,
  p_limit int DEFAULT 5,
  p_threshold float DEFAULT 0.7
)
RETURNS TABLE (
  decision_id uuid,
  decision_type text,
  similarity float,
  input_snapshot jsonb,
  rationale_text text,
  approval_status text,
  created_at timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dt.id as decision_id,
    dt.decision_type,
    1 - (dt.context_embedding <=> p_embedding) as similarity,
    dt.input_snapshot,
    dt.rationale_text,
    dt.approval_status,
    dt.created_at
  FROM decision_traces dt
  WHERE dt.org_id = p_org_id
    AND dt.context_embedding IS NOT NULL
    AND dt.approval_status IN ('approved', 'rejected')
    AND (p_decision_type IS NULL OR dt.decision_type = p_decision_type)
    AND 1 - (dt.context_embedding <=> p_embedding) >= p_threshold
  ORDER BY dt.context_embedding <=> p_embedding
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to search precedents by text (for non-vector fallback)
CREATE OR REPLACE FUNCTION search_precedents_by_text(
  p_org_id uuid,
  p_search_text text,
  p_decision_type text DEFAULT NULL,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  decision_id uuid,
  decision_type text,
  input_snapshot jsonb,
  rationale_text text,
  reason_codes text[],
  approval_status text,
  created_at timestamptz,
  relevance float
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dt.id as decision_id,
    dt.decision_type,
    dt.input_snapshot,
    dt.rationale_text,
    dt.reason_codes,
    dt.approval_status,
    dt.created_at,
    ts_rank(
      to_tsvector('english', COALESCE(dt.rationale_text, '') || ' ' || COALESCE(dt.input_snapshot::text, '')),
      plainto_tsquery('english', p_search_text)
    ) as relevance
  FROM decision_traces dt
  WHERE dt.org_id = p_org_id
    AND dt.approval_status IN ('approved', 'rejected')
    AND (p_decision_type IS NULL OR dt.decision_type = p_decision_type)
    AND (
      dt.rationale_text ILIKE '%' || p_search_text || '%'
      OR dt.input_snapshot::text ILIKE '%' || p_search_text || '%'
      OR EXISTS (SELECT 1 FROM unnest(dt.reason_codes) rc WHERE rc ILIKE '%' || p_search_text || '%')
    )
  ORDER BY relevance DESC, dt.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;