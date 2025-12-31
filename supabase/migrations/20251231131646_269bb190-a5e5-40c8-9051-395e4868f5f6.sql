
-- Create exchange rates table
CREATE TABLE public.exchange_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_currency VARCHAR(3) NOT NULL,
  to_currency VARCHAR(3) NOT NULL,
  rate NUMERIC(18, 8) NOT NULL,
  rate_date DATE NOT NULL,
  rate_type VARCHAR(20) NOT NULL DEFAULT 'spot',
  source VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, from_currency, to_currency, rate_date, rate_type)
);

-- Create currency gain/loss tracking table
CREATE TABLE public.currency_revaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_id UUID NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  revaluation_date DATE NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  source_id UUID NOT NULL,
  original_currency VARCHAR(3) NOT NULL,
  original_amount NUMERIC(18, 4) NOT NULL,
  functional_currency VARCHAR(3) NOT NULL DEFAULT 'USD',
  original_rate NUMERIC(18, 8) NOT NULL,
  current_rate NUMERIC(18, 8) NOT NULL,
  original_functional_amount NUMERIC(18, 4) NOT NULL,
  current_functional_amount NUMERIC(18, 4) NOT NULL,
  gain_loss_amount NUMERIC(18, 4) NOT NULL,
  gain_loss_type VARCHAR(20) NOT NULL,
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add currency fields to invoices
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 8) DEFAULT 1,
ADD COLUMN IF NOT EXISTS functional_total NUMERIC(18, 4);

-- Add currency fields to bills
ALTER TABLE public.bills
ADD COLUMN IF NOT EXISTS currency VARCHAR(3) DEFAULT 'USD',
ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18, 8) DEFAULT 1,
ADD COLUMN IF NOT EXISTS functional_total NUMERIC(18, 4);

-- Enable RLS
ALTER TABLE public.exchange_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_revaluations ENABLE ROW LEVEL SECURITY;

-- RLS policies for exchange_rates
CREATE POLICY "Users can view their org exchange rates" 
ON public.exchange_rates FOR SELECT 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage their org exchange rates" 
ON public.exchange_rates FOR ALL 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- RLS policies for currency_revaluations
CREATE POLICY "Users can view their org revaluations" 
ON public.currency_revaluations FOR SELECT 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can manage their org revaluations" 
ON public.currency_revaluations FOR ALL 
USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Create function to get exchange rate
CREATE OR REPLACE FUNCTION public.get_exchange_rate(
  p_org_id UUID,
  p_from_currency VARCHAR(3),
  p_to_currency VARCHAR(3),
  p_date DATE DEFAULT CURRENT_DATE,
  p_rate_type VARCHAR(20) DEFAULT 'spot'
)
RETURNS NUMERIC(18, 8) AS $$
DECLARE
  v_rate NUMERIC(18, 8);
BEGIN
  IF p_from_currency = p_to_currency THEN
    RETURN 1;
  END IF;
  
  SELECT rate INTO v_rate
  FROM public.exchange_rates
  WHERE org_id = p_org_id
    AND from_currency = p_from_currency
    AND to_currency = p_to_currency
    AND rate_date <= p_date
    AND is_active = true
  ORDER BY rate_date DESC
  LIMIT 1;
  
  IF v_rate IS NULL THEN
    SELECT 1 / rate INTO v_rate
    FROM public.exchange_rates
    WHERE org_id = p_org_id
      AND from_currency = p_to_currency
      AND to_currency = p_from_currency
      AND rate_date <= p_date
      AND is_active = true
    ORDER BY rate_date DESC
    LIMIT 1;
  END IF;
  
  RETURN COALESCE(v_rate, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create function to convert currency
CREATE OR REPLACE FUNCTION public.convert_currency(
  p_amount NUMERIC,
  p_org_id UUID,
  p_from_currency VARCHAR(3),
  p_to_currency VARCHAR(3),
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS NUMERIC(18, 4) AS $$
BEGIN
  RETURN p_amount * public.get_exchange_rate(p_org_id, p_from_currency, p_to_currency, p_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create indexes
CREATE INDEX idx_exchange_rates_lookup ON public.exchange_rates(org_id, from_currency, to_currency, rate_date DESC);
CREATE INDEX idx_currency_revaluations_source ON public.currency_revaluations(org_id, source_type, source_id);
CREATE INDEX idx_currency_revaluations_date ON public.currency_revaluations(org_id, revaluation_date);
