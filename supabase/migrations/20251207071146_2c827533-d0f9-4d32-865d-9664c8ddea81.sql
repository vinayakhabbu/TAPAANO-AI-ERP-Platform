-- Add controlling_category to accounts table
ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS controlling_category text DEFAULT 'no_co' 
CHECK (controlling_category IN ('no_co', 'primary_cost', 'secondary_cost', 'revenue_co'));

ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS default_cost_center_id uuid REFERENCES public.cost_centers(id);

ALTER TABLE public.accounts 
ADD COLUMN IF NOT EXISTS default_internal_order_id uuid;

-- Add CO dimensions to journal_lines
ALTER TABLE public.journal_lines
ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id);

ALTER TABLE public.journal_lines
ADD COLUMN IF NOT EXISTS internal_order_id uuid;

ALTER TABLE public.journal_lines
ADD COLUMN IF NOT EXISTS profit_center_id uuid;

ALTER TABLE public.journal_lines
ADD COLUMN IF NOT EXISTS wbs_element_id uuid;

-- Add source_module to journal_entries
ALTER TABLE public.journal_entries
ADD COLUMN IF NOT EXISTS source_module text DEFAULT 'gl'
CHECK (source_module IN ('gl', 'banking', 'ar', 'ap', 'payroll', 'other'));

-- Add valid_from/valid_to to cost_centers
ALTER TABLE public.cost_centers
ADD COLUMN IF NOT EXISTS valid_from date DEFAULT CURRENT_DATE;

ALTER TABLE public.cost_centers
ADD COLUMN IF NOT EXISTS valid_to date;

-- Create internal_orders table
CREATE TABLE IF NOT EXISTS public.internal_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  code text NOT NULL,
  name text NOT NULL,
  order_type text NOT NULL DEFAULT 'overhead',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  valid_from date DEFAULT CURRENT_DATE,
  valid_to date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, code)
);

ALTER TABLE public.internal_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org internal orders"
ON public.internal_orders FOR SELECT
USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org internal orders"
ON public.internal_orders FOR ALL
USING (org_id = get_user_org_id());

-- Create CO documents table (links GL to CO)
CREATE TABLE IF NOT EXISTS public.co_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  document_number text NOT NULL,
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id),
  posting_date date NOT NULL DEFAULT CURRENT_DATE,
  currency text NOT NULL DEFAULT 'USD',
  source_module text NOT NULL DEFAULT 'gl',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, document_number),
  UNIQUE(journal_entry_id)
);

ALTER TABLE public.co_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org CO documents"
ON public.co_documents FOR SELECT
USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org CO documents"
ON public.co_documents FOR ALL
USING (org_id = get_user_org_id());

-- Create CO document lines table
CREATE TABLE IF NOT EXISTS public.co_document_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  co_document_id uuid NOT NULL REFERENCES public.co_documents(id) ON DELETE CASCADE,
  line_number integer NOT NULL,
  journal_line_id uuid NOT NULL REFERENCES public.journal_lines(id),
  account_id uuid NOT NULL REFERENCES public.accounts(id),
  cost_center_id uuid REFERENCES public.cost_centers(id),
  internal_order_id uuid REFERENCES public.internal_orders(id),
  profit_center_id uuid,
  wbs_element_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.co_document_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view CO document lines for their docs"
ON public.co_document_lines FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.co_documents d
  WHERE d.id = co_document_lines.co_document_id
  AND d.org_id = get_user_org_id()
));

CREATE POLICY "Users can manage CO document lines for their docs"
ON public.co_document_lines FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.co_documents d
  WHERE d.id = co_document_lines.co_document_id
  AND d.org_id = get_user_org_id()
));

-- Add foreign key for internal_order_id in journal_lines
ALTER TABLE public.journal_lines
ADD CONSTRAINT journal_lines_internal_order_id_fkey 
FOREIGN KEY (internal_order_id) REFERENCES public.internal_orders(id);

-- Add foreign key for default_internal_order_id in accounts  
ALTER TABLE public.accounts
ADD CONSTRAINT accounts_default_internal_order_id_fkey
FOREIGN KEY (default_internal_order_id) REFERENCES public.internal_orders(id);

-- Update triggers
CREATE TRIGGER update_internal_orders_updated_at
  BEFORE UPDATE ON public.internal_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add journal_entry_id to bank_transactions if not exists
ALTER TABLE public.bank_transactions
ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES public.journal_entries(id);