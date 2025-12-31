-- Create agent_runs table to track execution steps
CREATE TABLE IF NOT EXISTS public.agent_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_type TEXT NOT NULL,
  run_status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  trigger_source TEXT,
  trigger_context JSONB DEFAULT '{}'::jsonb,
  result_summary TEXT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create agent_run_steps table for individual steps
CREATE TABLE IF NOT EXISTS public.agent_run_steps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  run_id UUID NOT NULL REFERENCES public.agent_runs(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  step_type TEXT NOT NULL,
  step_name TEXT NOT NULL,
  step_status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  input_data JSONB DEFAULT '{}'::jsonb,
  output_data JSONB DEFAULT '{}'::jsonb,
  duration_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add agent_run_id to decision_traces if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'decision_traces' AND column_name = 'agent_run_id'
  ) THEN
    ALTER TABLE public.decision_traces ADD COLUMN agent_run_id UUID REFERENCES public.agent_runs(id);
  END IF;
END $$;

-- Add is_precedent flag to decision_traces for marking as referenceable
ALTER TABLE public.decision_traces 
ADD COLUMN IF NOT EXISTS is_precedent BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS precedent_scope TEXT DEFAULT 'org',
ADD COLUMN IF NOT EXISTS precedent_notes TEXT;

-- Enable RLS
ALTER TABLE public.agent_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_run_steps ENABLE ROW LEVEL SECURITY;

-- RLS policies for agent_runs
CREATE POLICY "Users can view agent runs in their org"
  ON public.agent_runs FOR SELECT
  USING (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create agent runs in their org"
  ON public.agent_runs FOR INSERT
  WITH CHECK (org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- RLS policies for agent_run_steps
CREATE POLICY "Users can view steps for runs in their org"
  ON public.agent_run_steps FOR SELECT
  USING (run_id IN (
    SELECT id FROM public.agent_runs 
    WHERE org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  ));

CREATE POLICY "Users can create steps for runs in their org"
  ON public.agent_run_steps FOR INSERT
  WITH CHECK (run_id IN (
    SELECT id FROM public.agent_runs 
    WHERE org_id = (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  ));

-- Indexes
CREATE INDEX IF NOT EXISTS idx_agent_runs_org_id ON public.agent_runs(org_id);
CREATE INDEX IF NOT EXISTS idx_agent_runs_started_at ON public.agent_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_run_steps_run_id ON public.agent_run_steps(run_id);
CREATE INDEX IF NOT EXISTS idx_decision_traces_is_precedent ON public.decision_traces(is_precedent) WHERE is_precedent = true;