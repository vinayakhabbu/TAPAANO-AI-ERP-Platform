-- Create quotation status enum
CREATE TYPE public.quotation_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired', 'converted');

-- Create quotations table
CREATE TABLE public.quotations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  quote_number TEXT NOT NULL,
  quote_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_until DATE,
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  status public.quotation_status NOT NULL DEFAULT 'draft',
  notes TEXT,
  converted_so_id UUID REFERENCES public.sales_orders(id),
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create quotation lines table
CREATE TABLE public.quotation_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id UUID NOT NULL REFERENCES public.quotations(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,
  account_id UUID REFERENCES public.accounts(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotation_lines ENABLE ROW LEVEL SECURITY;

-- RLS policies for quotations
CREATE POLICY "Users can view their org quotations"
  ON public.quotations FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org quotations"
  ON public.quotations FOR ALL
  USING (org_id = get_user_org_id());

-- RLS policies for quotation lines
CREATE POLICY "Users can view quotation lines for their quotes"
  ON public.quotation_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM quotations q
    WHERE q.id = quotation_lines.quotation_id
    AND q.org_id = get_user_org_id()
  ));

CREATE POLICY "Users can manage quotation lines for their quotes"
  ON public.quotation_lines FOR ALL
  USING (EXISTS (
    SELECT 1 FROM quotations q
    WHERE q.id = quotation_lines.quotation_id
    AND q.org_id = get_user_org_id()
  ));

-- Add updated_at trigger
CREATE TRIGGER update_quotations_updated_at
  BEFORE UPDATE ON public.quotations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();