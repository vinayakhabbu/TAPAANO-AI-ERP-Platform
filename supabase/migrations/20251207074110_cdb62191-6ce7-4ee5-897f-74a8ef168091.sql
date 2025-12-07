-- Service Contracts table
CREATE TABLE public.service_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  contract_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  description TEXT,
  contract_type TEXT NOT NULL DEFAULT 'standard',
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  billing_frequency TEXT DEFAULT 'monthly',
  contract_value NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  terms_and_conditions TEXT,
  auto_renew BOOLEAN DEFAULT false,
  renewal_period_months INTEGER DEFAULT 12,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Warranty Tracking table
CREATE TABLE public.warranties (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  warranty_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  product_id UUID REFERENCES public.products(id),
  serial_number TEXT,
  purchase_date DATE,
  warranty_start_date DATE NOT NULL,
  warranty_end_date DATE NOT NULL,
  warranty_type TEXT NOT NULL DEFAULT 'standard',
  coverage_details TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Service Calls table
CREATE TABLE public.service_calls (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  call_number TEXT NOT NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  contract_id UUID REFERENCES public.service_contracts(id),
  warranty_id UUID REFERENCES public.warranties(id),
  product_id UUID REFERENCES public.products(id),
  priority TEXT NOT NULL DEFAULT 'medium',
  status TEXT NOT NULL DEFAULT 'open',
  call_type TEXT NOT NULL DEFAULT 'repair',
  subject TEXT NOT NULL,
  description TEXT,
  reported_issue TEXT,
  resolution TEXT,
  reported_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  scheduled_date TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  assigned_to UUID,
  estimated_duration_hours NUMERIC DEFAULT 1,
  actual_duration_hours NUMERIC,
  is_billable BOOLEAN DEFAULT true,
  labor_cost NUMERIC DEFAULT 0,
  parts_cost NUMERIC DEFAULT 0,
  total_cost NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Field Service Visits table
CREATE TABLE public.field_service_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  visit_number TEXT NOT NULL,
  service_call_id UUID REFERENCES public.service_calls(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  technician_id UUID,
  visit_type TEXT NOT NULL DEFAULT 'scheduled',
  status TEXT NOT NULL DEFAULT 'scheduled',
  scheduled_start TIMESTAMP WITH TIME ZONE NOT NULL,
  scheduled_end TIMESTAMP WITH TIME ZONE,
  actual_start TIMESTAMP WITH TIME ZONE,
  actual_end TIMESTAMP WITH TIME ZONE,
  location_address TEXT,
  location_notes TEXT,
  work_performed TEXT,
  parts_used TEXT,
  customer_signature TEXT,
  notes TEXT,
  travel_time_hours NUMERIC DEFAULT 0,
  work_time_hours NUMERIC DEFAULT 0,
  mileage NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.service_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warranties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.field_service_visits ENABLE ROW LEVEL SECURITY;

-- RLS Policies for service_contracts
CREATE POLICY "Users can view their org service contracts" ON public.service_contracts
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org service contracts" ON public.service_contracts
  FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for warranties
CREATE POLICY "Users can view their org warranties" ON public.warranties
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org warranties" ON public.warranties
  FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for service_calls
CREATE POLICY "Users can view their org service calls" ON public.service_calls
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org service calls" ON public.service_calls
  FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for field_service_visits
CREATE POLICY "Users can view their org field visits" ON public.field_service_visits
  FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org field visits" ON public.field_service_visits
  FOR ALL USING (org_id = get_user_org_id());

-- Update triggers
CREATE TRIGGER update_service_contracts_updated_at BEFORE UPDATE ON public.service_contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_warranties_updated_at BEFORE UPDATE ON public.warranties
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_service_calls_updated_at BEFORE UPDATE ON public.service_calls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_field_service_visits_updated_at BEFORE UPDATE ON public.field_service_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();