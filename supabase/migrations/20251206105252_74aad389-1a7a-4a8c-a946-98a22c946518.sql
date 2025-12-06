-- Create the update_updated_at_column function if it doesn't exist
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create purchase_requisitions table
CREATE TABLE public.purchase_requisitions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  requisition_number TEXT NOT NULL,
  requester_id UUID REFERENCES auth.users(id),
  department TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'converted', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  required_date DATE,
  notes TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  rejected_by UUID REFERENCES auth.users(id),
  rejected_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  purchase_order_id UUID REFERENCES public.purchase_orders(id),
  converted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create purchase_requisition_lines table
CREATE TABLE public.purchase_requisition_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  requisition_id UUID NOT NULL REFERENCES public.purchase_requisitions(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id),
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_of_measure TEXT NOT NULL DEFAULT 'EA',
  estimated_unit_cost NUMERIC NOT NULL DEFAULT 0,
  estimated_total NUMERIC GENERATED ALWAYS AS (quantity * estimated_unit_cost) STORED,
  suggested_vendor_id UUID REFERENCES public.vendors(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.purchase_requisitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_requisition_lines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for purchase_requisitions
CREATE POLICY "Users can view their org purchase requisitions"
  ON public.purchase_requisitions
  FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org purchase requisitions"
  ON public.purchase_requisitions
  FOR ALL
  USING (org_id = get_user_org_id());

-- RLS Policies for purchase_requisition_lines
CREATE POLICY "Users can view requisition lines for their requisitions"
  ON public.purchase_requisition_lines
  FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.purchase_requisitions pr
    WHERE pr.id = purchase_requisition_lines.requisition_id
    AND pr.org_id = get_user_org_id()
  ));

CREATE POLICY "Users can manage requisition lines for their requisitions"
  ON public.purchase_requisition_lines
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.purchase_requisitions pr
    WHERE pr.id = purchase_requisition_lines.requisition_id
    AND pr.org_id = get_user_org_id()
  ));

-- Create trigger for updated_at
CREATE TRIGGER update_purchase_requisitions_updated_at
  BEFORE UPDATE ON public.purchase_requisitions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();