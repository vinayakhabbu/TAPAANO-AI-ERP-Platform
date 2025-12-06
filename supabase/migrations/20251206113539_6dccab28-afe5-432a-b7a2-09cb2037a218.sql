-- Create sales_targets table for target vs actual tracking
CREATE TABLE public.sales_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL DEFAULT 'monthly', -- monthly, quarterly, yearly
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  target_amount NUMERIC NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.sales_targets ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view their org sales targets" 
ON public.sales_targets 
FOR SELECT 
USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org sales targets" 
ON public.sales_targets 
FOR ALL 
USING (org_id = get_user_org_id());

-- Updated_at trigger
CREATE TRIGGER update_sales_targets_updated_at
BEFORE UPDATE ON public.sales_targets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();