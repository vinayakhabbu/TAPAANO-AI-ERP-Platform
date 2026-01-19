-- Create auto_approval_configs table to store approval thresholds
CREATE TABLE public.auto_approval_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  decision_type TEXT NOT NULL,
  min_precedent_similarity NUMERIC(3,2) NOT NULL DEFAULT 0.75,
  min_precedent_count INTEGER NOT NULL DEFAULT 2,
  max_auto_approval_amount NUMERIC(15,2) NOT NULL DEFAULT 5000,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, decision_type)
);

-- Enable RLS
ALTER TABLE public.auto_approval_configs ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their org's configs"
ON public.auto_approval_configs
FOR SELECT
TO authenticated
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage their org's configs"
ON public.auto_approval_configs
FOR ALL
TO authenticated
USING (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  AND public.has_role(auth.uid(), 'admin')
)
WITH CHECK (
  org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
  AND public.has_role(auth.uid(), 'admin')
);

-- Trigger for updated_at
CREATE TRIGGER update_auto_approval_configs_updated_at
BEFORE UPDATE ON public.auto_approval_configs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default configs for existing orgs
INSERT INTO public.auto_approval_configs (org_id, decision_type, min_precedent_similarity, min_precedent_count, max_auto_approval_amount, enabled)
SELECT o.id, 'po_approval', 0.75, 2, 5000, true FROM public.organizations o
ON CONFLICT DO NOTHING;

INSERT INTO public.auto_approval_configs (org_id, decision_type, min_precedent_similarity, min_precedent_count, max_auto_approval_amount, enabled)
SELECT o.id, 'payment_approval', 0.80, 3, 10000, true FROM public.organizations o
ON CONFLICT DO NOTHING;

INSERT INTO public.auto_approval_configs (org_id, decision_type, min_precedent_similarity, min_precedent_count, max_auto_approval_amount, enabled)
SELECT o.id, 'requisition_approval', 0.70, 2, 3000, true FROM public.organizations o
ON CONFLICT DO NOTHING;

INSERT INTO public.auto_approval_configs (org_id, decision_type, min_precedent_similarity, min_precedent_count, max_auto_approval_amount, enabled)
SELECT o.id, 'journal_post', 0.85, 3, 999999999, true FROM public.organizations o
ON CONFLICT DO NOTHING;