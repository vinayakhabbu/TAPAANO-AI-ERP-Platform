
-- Tax Jurisdictions (countries, states, regions)
CREATE TABLE public.tax_jurisdictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  country_code VARCHAR(3) NOT NULL,
  state_province VARCHAR(50),
  jurisdiction_type VARCHAR(20) NOT NULL DEFAULT 'country', -- country, state, city, special
  parent_id UUID REFERENCES public.tax_jurisdictions(id),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, code)
);

-- Tax Codes (VAT, Sales Tax, GST, etc.)
CREATE TABLE public.tax_codes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  tax_type VARCHAR(30) NOT NULL DEFAULT 'sales', -- sales, purchase, vat_output, vat_input, withholding
  is_recoverable BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  gl_account_id UUID REFERENCES public.accounts(id), -- Tax liability/receivable account
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, code)
);

-- Tax Rates (rates per code with effective dates and jurisdictions)
CREATE TABLE public.tax_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  tax_code_id UUID NOT NULL REFERENCES public.tax_codes(id) ON DELETE CASCADE,
  jurisdiction_id UUID REFERENCES public.tax_jurisdictions(id),
  rate DECIMAL(8, 4) NOT NULL, -- Rate as percentage (e.g., 7.5 for 7.5%)
  effective_from DATE NOT NULL,
  effective_to DATE,
  priority INTEGER NOT NULL DEFAULT 0, -- For overlapping rates
  is_compound BOOLEAN NOT NULL DEFAULT false, -- Tax on tax
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tax Transactions (detailed tax lines on invoices/bills)
CREATE TABLE public.tax_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  tax_code_id UUID NOT NULL REFERENCES public.tax_codes(id),
  tax_rate_id UUID REFERENCES public.tax_rates(id),
  jurisdiction_id UUID REFERENCES public.tax_jurisdictions(id),
  source_type VARCHAR(20) NOT NULL, -- invoice, bill, journal
  source_id UUID NOT NULL,
  transaction_date DATE NOT NULL,
  tax_period VARCHAR(7) NOT NULL, -- YYYY-MM format
  base_amount DECIMAL(15, 2) NOT NULL, -- Amount before tax
  tax_rate DECIMAL(8, 4) NOT NULL, -- Rate applied
  tax_amount DECIMAL(15, 2) NOT NULL, -- Calculated tax
  currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  exchange_rate DECIMAL(10, 6) DEFAULT 1,
  functional_tax_amount DECIMAL(15, 2), -- Tax in functional currency
  is_recoverable BOOLEAN NOT NULL DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, filed, paid
  filed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tax Filing Periods
CREATE TABLE public.tax_filing_periods (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  jurisdiction_id UUID NOT NULL REFERENCES public.tax_jurisdictions(id),
  period_name VARCHAR(50) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  filing_due_date DATE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open', -- open, closed, filed, paid
  total_sales_tax DECIMAL(15, 2) DEFAULT 0,
  total_purchase_tax DECIMAL(15, 2) DEFAULT 0,
  net_tax_payable DECIMAL(15, 2) DEFAULT 0,
  filed_at TIMESTAMP WITH TIME ZONE,
  paid_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add tax fields to invoice_lines and bill_lines if they exist, or create tax linkage
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS tax_code_id UUID REFERENCES public.tax_codes(id);
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS tax_code_id UUID REFERENCES public.tax_codes(id);

-- Enable RLS
ALTER TABLE public.tax_jurisdictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_filing_periods ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view tax jurisdictions" ON public.tax_jurisdictions FOR SELECT USING (true);
CREATE POLICY "Users can manage tax jurisdictions" ON public.tax_jurisdictions FOR ALL USING (true);

CREATE POLICY "Users can view tax codes" ON public.tax_codes FOR SELECT USING (true);
CREATE POLICY "Users can manage tax codes" ON public.tax_codes FOR ALL USING (true);

CREATE POLICY "Users can view tax rates" ON public.tax_rates FOR SELECT USING (true);
CREATE POLICY "Users can manage tax rates" ON public.tax_rates FOR ALL USING (true);

CREATE POLICY "Users can view tax transactions" ON public.tax_transactions FOR SELECT USING (true);
CREATE POLICY "Users can manage tax transactions" ON public.tax_transactions FOR ALL USING (true);

CREATE POLICY "Users can view tax filing periods" ON public.tax_filing_periods FOR SELECT USING (true);
CREATE POLICY "Users can manage tax filing periods" ON public.tax_filing_periods FOR ALL USING (true);

-- Function to calculate tax
CREATE OR REPLACE FUNCTION public.calculate_tax(
  p_amount DECIMAL,
  p_tax_code_id UUID,
  p_transaction_date DATE DEFAULT CURRENT_DATE,
  p_jurisdiction_id UUID DEFAULT NULL
)
RETURNS DECIMAL AS $$
DECLARE
  v_rate DECIMAL;
BEGIN
  SELECT rate INTO v_rate
  FROM public.tax_rates
  WHERE tax_code_id = p_tax_code_id
    AND is_active = true
    AND effective_from <= p_transaction_date
    AND (effective_to IS NULL OR effective_to >= p_transaction_date)
    AND (p_jurisdiction_id IS NULL OR jurisdiction_id = p_jurisdiction_id OR jurisdiction_id IS NULL)
  ORDER BY 
    CASE WHEN jurisdiction_id = p_jurisdiction_id THEN 0 ELSE 1 END,
    priority DESC,
    effective_from DESC
  LIMIT 1;
  
  IF v_rate IS NULL THEN
    RETURN 0;
  END IF;
  
  RETURN ROUND(p_amount * v_rate / 100, 2);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to get current tax rate for a code
CREATE OR REPLACE FUNCTION public.get_current_tax_rate(
  p_tax_code_id UUID,
  p_jurisdiction_id UUID DEFAULT NULL
)
RETURNS DECIMAL AS $$
DECLARE
  v_rate DECIMAL;
BEGIN
  SELECT rate INTO v_rate
  FROM public.tax_rates
  WHERE tax_code_id = p_tax_code_id
    AND is_active = true
    AND effective_from <= CURRENT_DATE
    AND (effective_to IS NULL OR effective_to >= CURRENT_DATE)
    AND (p_jurisdiction_id IS NULL OR jurisdiction_id = p_jurisdiction_id OR jurisdiction_id IS NULL)
  ORDER BY 
    CASE WHEN jurisdiction_id = p_jurisdiction_id THEN 0 ELSE 1 END,
    priority DESC
  LIMIT 1;
  
  RETURN COALESCE(v_rate, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Indexes for performance
CREATE INDEX idx_tax_rates_code_date ON public.tax_rates(tax_code_id, effective_from, effective_to);
CREATE INDEX idx_tax_transactions_source ON public.tax_transactions(source_type, source_id);
CREATE INDEX idx_tax_transactions_period ON public.tax_transactions(tax_period, status);
CREATE INDEX idx_tax_filing_periods_entity ON public.tax_filing_periods(entity_id, period_start);
