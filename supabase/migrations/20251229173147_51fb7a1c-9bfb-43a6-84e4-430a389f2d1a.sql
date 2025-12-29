-- Create table to track when humans override auto-approved decisions
CREATE TABLE public.decision_overrides (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  original_decision_id UUID NOT NULL REFERENCES public.decision_traces(id) ON DELETE CASCADE,
  override_type TEXT NOT NULL CHECK (override_type IN ('revoke_approval', 'force_reject', 'force_approve')),
  decision_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  original_confidence NUMERIC,
  override_reason TEXT NOT NULL,
  overridden_by UUID REFERENCES auth.users(id),
  overridden_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  learned BOOLEAN NOT NULL DEFAULT false,
  learned_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.decision_overrides ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view overrides in their organization" 
ON public.decision_overrides 
FOR SELECT 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create overrides in their organization" 
ON public.decision_overrides 
FOR INSERT 
WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can update overrides in their organization" 
ON public.decision_overrides 
FOR UPDATE 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Add index for efficient lookups
CREATE INDEX idx_decision_overrides_decision_type ON public.decision_overrides(decision_type, source_type);
CREATE INDEX idx_decision_overrides_org_id ON public.decision_overrides(org_id);

-- Add confidence adjustment column to store learned adjustments per decision type
CREATE TABLE public.confidence_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL,
  source_type TEXT NOT NULL,
  adjustment_factor NUMERIC NOT NULL DEFAULT 0,
  override_count INTEGER NOT NULL DEFAULT 0,
  last_calculated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, decision_type, source_type)
);

-- Enable RLS
ALTER TABLE public.confidence_adjustments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view adjustments in their organization" 
ON public.confidence_adjustments 
FOR SELECT 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage adjustments in their organization" 
ON public.confidence_adjustments 
FOR ALL 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));