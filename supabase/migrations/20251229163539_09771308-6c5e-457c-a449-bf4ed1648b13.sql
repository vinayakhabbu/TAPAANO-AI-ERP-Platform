-- Decision Ledger: Core table for capturing decision trails
CREATE TABLE public.decision_traces (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL, -- po_approval, payment_approval, credit_override, discount_override, etc.
  agent_run_id TEXT, -- optional, for agent-initiated decisions
  
  -- Input snapshot (state at decision time)
  input_snapshot JSONB NOT NULL DEFAULT '{}',
  
  -- Policy evaluation details
  policy_evaluation JSONB DEFAULT '{}',
  
  -- Approval workflow
  approval_status TEXT NOT NULL DEFAULT 'pending', -- pending, approved, rejected, auto_approved
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  approval_channel TEXT DEFAULT 'ERP_UI', -- ERP_UI, API, Slack, Email
  
  -- Structured rationale
  reason_codes TEXT[] DEFAULT '{}',
  rationale_text TEXT,
  
  -- What changed (before/after diffs)
  commit_writes JSONB DEFAULT '[]',
  
  -- Source reference (what triggered this decision)
  source_type TEXT, -- purchase_order, payment_run, journal_entry, etc.
  source_id UUID,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Junction table linking decisions to affected entities
CREATE TABLE public.decision_entities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_id UUID NOT NULL REFERENCES public.decision_traces(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- customer, vendor, purchase_order, bill, invoice, policy, approver
  entity_id UUID NOT NULL,
  entity_label TEXT, -- human-readable label snapshot
  entity_snapshot JSONB, -- optional snapshot of entity state
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Precedent references for learning from past decisions
CREATE TABLE public.precedent_references (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  decision_id UUID NOT NULL REFERENCES public.decision_traces(id) ON DELETE CASCADE,
  precedent_decision_id UUID NOT NULL REFERENCES public.decision_traces(id) ON DELETE CASCADE,
  similarity_score NUMERIC(4,3), -- 0.000 to 1.000
  match_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT no_self_reference CHECK (decision_id != precedent_decision_id)
);

-- Indexes for common queries
CREATE INDEX idx_decision_traces_org ON public.decision_traces(org_id);
CREATE INDEX idx_decision_traces_type ON public.decision_traces(decision_type);
CREATE INDEX idx_decision_traces_status ON public.decision_traces(approval_status);
CREATE INDEX idx_decision_traces_source ON public.decision_traces(source_type, source_id);
CREATE INDEX idx_decision_traces_created ON public.decision_traces(created_at DESC);
CREATE INDEX idx_decision_entities_decision ON public.decision_entities(decision_id);
CREATE INDEX idx_decision_entities_entity ON public.decision_entities(entity_type, entity_id);
CREATE INDEX idx_precedent_references_decision ON public.precedent_references(decision_id);

-- Enable RLS
ALTER TABLE public.decision_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.decision_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.precedent_references ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access decisions in their org
CREATE POLICY "Users can view decisions in their org"
ON public.decision_traces FOR SELECT
USING (org_id IN (
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can create decisions in their org"
ON public.decision_traces FOR INSERT
WITH CHECK (org_id IN (
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
));

CREATE POLICY "Users can update decisions in their org"
ON public.decision_traces FOR UPDATE
USING (org_id IN (
  SELECT org_id FROM public.profiles WHERE id = auth.uid()
));

-- Decision entities inherit access from parent decision
CREATE POLICY "Users can view decision entities"
ON public.decision_entities FOR SELECT
USING (decision_id IN (
  SELECT id FROM public.decision_traces WHERE org_id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  )
));

CREATE POLICY "Users can create decision entities"
ON public.decision_entities FOR INSERT
WITH CHECK (decision_id IN (
  SELECT id FROM public.decision_traces WHERE org_id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  )
));

-- Precedent references inherit access
CREATE POLICY "Users can view precedent references"
ON public.precedent_references FOR SELECT
USING (decision_id IN (
  SELECT id FROM public.decision_traces WHERE org_id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  )
));

CREATE POLICY "Users can create precedent references"
ON public.precedent_references FOR INSERT
WITH CHECK (decision_id IN (
  SELECT id FROM public.decision_traces WHERE org_id IN (
    SELECT org_id FROM public.profiles WHERE id = auth.uid()
  )
));

-- Trigger for updated_at
CREATE TRIGGER update_decision_traces_updated_at
BEFORE UPDATE ON public.decision_traces
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();