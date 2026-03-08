
CREATE TABLE public.investor_metrics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_date date NOT NULL,
  mrr numeric DEFAULT 0,
  arr numeric DEFAULT 0,
  new_mrr numeric DEFAULT 0,
  churned_mrr numeric DEFAULT 0,
  expansion_mrr numeric DEFAULT 0,
  contraction_mrr numeric DEFAULT 0,
  active_customers integer DEFAULT 0,
  new_customers integer DEFAULT 0,
  churned_customers integer DEFAULT 0,
  nrr numeric DEFAULT 0,
  gross_churn_rate numeric DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(org_id, period_date)
);

ALTER TABLE public.investor_metrics_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view their metrics snapshots"
  ON public.investor_metrics_snapshots
  FOR SELECT
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org members can insert their metrics snapshots"
  ON public.investor_metrics_snapshots
  FOR INSERT
  WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Org members can update their metrics snapshots"
  ON public.investor_metrics_snapshots
  FOR UPDATE
  USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE INDEX idx_investor_metrics_org_period ON public.investor_metrics_snapshots(org_id, period_date DESC);

CREATE TRIGGER update_investor_metrics_snapshots_updated_at
  BEFORE UPDATE ON public.investor_metrics_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
