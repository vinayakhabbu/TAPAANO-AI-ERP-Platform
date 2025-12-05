-- Sales Orders table
CREATE TABLE public.sales_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  so_number TEXT NOT NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  requested_delivery_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'confirmed', 'partially_shipped', 'shipped', 'invoiced', 'cancelled')),
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Sales Order Lines table
CREATE TABLE public.sales_order_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,
  shipped_quantity NUMERIC NOT NULL DEFAULT 0,
  account_id UUID REFERENCES public.accounts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shipments table
CREATE TABLE public.shipments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  sales_order_id UUID NOT NULL REFERENCES public.sales_orders(id),
  shipment_number TEXT NOT NULL,
  ship_date DATE NOT NULL DEFAULT CURRENT_DATE,
  carrier TEXT,
  tracking_number TEXT,
  notes TEXT,
  shipped_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Shipment Lines table
CREATE TABLE public.shipment_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  sales_order_line_id UUID NOT NULL REFERENCES public.sales_order_lines(id),
  quantity_shipped NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add sales_order_id to invoices for O2C linkage
ALTER TABLE public.invoices ADD COLUMN sales_order_id UUID REFERENCES public.sales_orders(id);
ALTER TABLE public.invoices ADD COLUMN shipment_id UUID REFERENCES public.shipments(id);

-- Enable RLS
ALTER TABLE public.sales_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_lines ENABLE ROW LEVEL SECURITY;

-- Sales Orders policies
CREATE POLICY "Users can view their org sales orders" ON public.sales_orders FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org sales orders" ON public.sales_orders FOR ALL USING (org_id = get_user_org_id());

-- Sales Order Lines policies
CREATE POLICY "Users can view SO lines for their orders" ON public.sales_order_lines FOR SELECT USING (EXISTS (SELECT 1 FROM sales_orders so WHERE so.id = sales_order_lines.sales_order_id AND so.org_id = get_user_org_id()));
CREATE POLICY "Users can manage SO lines for their orders" ON public.sales_order_lines FOR ALL USING (EXISTS (SELECT 1 FROM sales_orders so WHERE so.id = sales_order_lines.sales_order_id AND so.org_id = get_user_org_id()));

-- Shipments policies
CREATE POLICY "Users can view their org shipments" ON public.shipments FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org shipments" ON public.shipments FOR ALL USING (org_id = get_user_org_id());

-- Shipment Lines policies
CREATE POLICY "Users can view shipment lines for their shipments" ON public.shipment_lines FOR SELECT USING (EXISTS (SELECT 1 FROM shipments s WHERE s.id = shipment_lines.shipment_id AND s.org_id = get_user_org_id()));
CREATE POLICY "Users can manage shipment lines for their shipments" ON public.shipment_lines FOR ALL USING (EXISTS (SELECT 1 FROM shipments s WHERE s.id = shipment_lines.shipment_id AND s.org_id = get_user_org_id()));

-- Triggers for updated_at
CREATE TRIGGER update_sales_orders_updated_at BEFORE UPDATE ON public.sales_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_shipments_updated_at BEFORE UPDATE ON public.shipments FOR EACH ROW EXECUTE FUNCTION update_updated_at();