-- Cost Centers table
CREATE TABLE public.cost_centers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  parent_id UUID REFERENCES public.cost_centers(id),
  manager_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, code)
);

-- Projects table for cost monitoring
CREATE TABLE public.projects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  project_number TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  cost_center_id UUID REFERENCES public.cost_centers(id),
  customer_id UUID REFERENCES public.customers(id),
  status TEXT NOT NULL DEFAULT 'planning',
  start_date DATE,
  end_date DATE,
  budget_amount NUMERIC NOT NULL DEFAULT 0,
  actual_cost NUMERIC NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, project_number)
);

-- Fixed Assets table
CREATE TABLE public.fixed_assets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  asset_number TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL,
  acquisition_date DATE NOT NULL,
  acquisition_cost NUMERIC NOT NULL,
  salvage_value NUMERIC NOT NULL DEFAULT 0,
  useful_life_months INTEGER NOT NULL,
  depreciation_method TEXT NOT NULL DEFAULT 'straight_line',
  accumulated_depreciation NUMERIC NOT NULL DEFAULT 0,
  book_value NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  location TEXT,
  cost_center_id UUID REFERENCES public.cost_centers(id),
  disposed_date DATE,
  disposal_amount NUMERIC,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, asset_number)
);

-- Asset Depreciation table
CREATE TABLE public.asset_depreciation (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  asset_id UUID NOT NULL REFERENCES public.fixed_assets(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  depreciation_amount NUMERIC NOT NULL,
  accumulated_depreciation NUMERIC NOT NULL,
  book_value NUMERIC NOT NULL,
  posted BOOLEAN NOT NULL DEFAULT false,
  posted_at TIMESTAMP WITH TIME ZONE,
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Budgets table
CREATE TABLE public.budgets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  budget_number TEXT NOT NULL,
  name TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  total_amount NUMERIC NOT NULL DEFAULT 0,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, budget_number)
);

-- Budget Lines table
CREATE TABLE public.budget_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  budget_id UUID NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.accounts(id),
  cost_center_id UUID REFERENCES public.cost_centers(id),
  project_id UUID REFERENCES public.projects(id),
  period_month INTEGER NOT NULL,
  budgeted_amount NUMERIC NOT NULL DEFAULT 0,
  actual_amount NUMERIC NOT NULL DEFAULT 0,
  variance NUMERIC GENERATED ALWAYS AS (budgeted_amount - actual_amount) STORED,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Cash Flow Forecasts table
CREATE TABLE public.cash_flow_forecasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  forecast_date DATE NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  expected_inflow NUMERIC NOT NULL DEFAULT 0,
  expected_outflow NUMERIC NOT NULL DEFAULT 0,
  actual_inflow NUMERIC NOT NULL DEFAULT 0,
  actual_outflow NUMERIC NOT NULL DEFAULT 0,
  source_type TEXT,
  source_id UUID,
  confidence_level TEXT DEFAULT 'medium',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cost_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fixed_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_depreciation ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budget_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flow_forecasts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for cost_centers
CREATE POLICY "Users can view their org cost centers" ON public.cost_centers FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org cost centers" ON public.cost_centers FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for projects
CREATE POLICY "Users can view their org projects" ON public.projects FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org projects" ON public.projects FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for fixed_assets
CREATE POLICY "Users can view their org fixed assets" ON public.fixed_assets FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org fixed assets" ON public.fixed_assets FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for asset_depreciation
CREATE POLICY "Users can view their org asset depreciation" ON public.asset_depreciation FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org asset depreciation" ON public.asset_depreciation FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for budgets
CREATE POLICY "Users can view their org budgets" ON public.budgets FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org budgets" ON public.budgets FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for budget_lines
CREATE POLICY "Users can view budget lines for their budgets" ON public.budget_lines FOR SELECT USING (EXISTS (SELECT 1 FROM budgets b WHERE b.id = budget_lines.budget_id AND b.org_id = get_user_org_id()));
CREATE POLICY "Users can manage budget lines for their budgets" ON public.budget_lines FOR ALL USING (EXISTS (SELECT 1 FROM budgets b WHERE b.id = budget_lines.budget_id AND b.org_id = get_user_org_id()));

-- RLS Policies for cash_flow_forecasts
CREATE POLICY "Users can view their org cash flow forecasts" ON public.cash_flow_forecasts FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org cash flow forecasts" ON public.cash_flow_forecasts FOR ALL USING (org_id = get_user_org_id());

-- Create update triggers
CREATE TRIGGER update_cost_centers_updated_at BEFORE UPDATE ON public.cost_centers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_fixed_assets_updated_at BEFORE UPDATE ON public.fixed_assets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON public.budgets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_budget_lines_updated_at BEFORE UPDATE ON public.budget_lines FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_cash_flow_forecasts_updated_at BEFORE UPDATE ON public.cash_flow_forecasts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();