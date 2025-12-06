-- Create opportunities table for sales opportunity management
CREATE TABLE public.opportunities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_id UUID REFERENCES public.customers(id),
  opportunity_name TEXT NOT NULL,
  opportunity_number TEXT NOT NULL,
  description TEXT,
  stage TEXT NOT NULL DEFAULT 'lead',
  probability INTEGER DEFAULT 10,
  expected_value NUMERIC NOT NULL DEFAULT 0,
  expected_close_date DATE,
  source TEXT,
  assigned_to UUID,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  won_reason TEXT,
  lost_reason TEXT,
  CONSTRAINT valid_probability CHECK (probability >= 0 AND probability <= 100)
);

-- Create index for common queries
CREATE INDEX idx_opportunities_org_id ON public.opportunities(org_id);
CREATE INDEX idx_opportunities_stage ON public.opportunities(stage);
CREATE INDEX idx_opportunities_customer_id ON public.opportunities(customer_id);

-- Enable RLS
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their org opportunities" 
ON public.opportunities 
FOR SELECT 
USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org opportunities" 
ON public.opportunities 
FOR ALL 
USING (org_id = get_user_org_id());

-- Create trigger for updated_at
CREATE TRIGGER update_opportunities_updated_at
BEFORE UPDATE ON public.opportunities
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();