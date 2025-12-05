-- Create enum for PO status
CREATE TYPE public.po_status AS ENUM ('draft', 'pending_approval', 'approved', 'partially_received', 'received', 'cancelled');

-- Create enum for payment run status
CREATE TYPE public.payment_run_status AS ENUM ('draft', 'pending_approval', 'approved', 'processing', 'completed', 'failed');

-- Purchase Orders table
CREATE TABLE public.purchase_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  entity_id UUID NOT NULL,
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  po_number TEXT NOT NULL,
  order_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_delivery_date DATE,
  status po_status NOT NULL DEFAULT 'draft',
  subtotal NUMERIC NOT NULL DEFAULT 0,
  tax NUMERIC NOT NULL DEFAULT 0,
  total NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Purchase Order Lines
CREATE TABLE public.purchase_order_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_price NUMERIC NOT NULL DEFAULT 0,
  amount NUMERIC NOT NULL DEFAULT 0,
  received_quantity NUMERIC NOT NULL DEFAULT 0,
  account_id UUID REFERENCES public.accounts(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Goods Receipts table
CREATE TABLE public.goods_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  entity_id UUID NOT NULL,
  purchase_order_id UUID NOT NULL REFERENCES public.purchase_orders(id),
  receipt_number TEXT NOT NULL,
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  received_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Goods Receipt Lines
CREATE TABLE public.goods_receipt_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  goods_receipt_id UUID NOT NULL REFERENCES public.goods_receipts(id) ON DELETE CASCADE,
  purchase_order_line_id UUID NOT NULL REFERENCES public.purchase_order_lines(id),
  quantity_received NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Payment Runs table
CREATE TABLE public.payment_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  entity_id UUID NOT NULL,
  run_number TEXT NOT NULL,
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  status payment_run_status NOT NULL DEFAULT 'draft',
  total_amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'ach',
  bank_account_id UUID REFERENCES public.bank_accounts(id),
  created_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Payment Run Items (bills to pay)
CREATE TABLE public.payment_run_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_run_id UUID NOT NULL REFERENCES public.payment_runs(id) ON DELETE CASCADE,
  bill_id UUID NOT NULL REFERENCES public.bills(id),
  amount NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add PO reference to bills for 3-way matching
ALTER TABLE public.bills ADD COLUMN purchase_order_id UUID REFERENCES public.purchase_orders(id);
ALTER TABLE public.bills ADD COLUMN goods_receipt_id UUID REFERENCES public.goods_receipts(id);
ALTER TABLE public.bills ADD COLUMN match_status TEXT DEFAULT 'unmatched';

-- Enable RLS
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goods_receipt_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_run_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for Purchase Orders
CREATE POLICY "Users can view their org purchase orders" ON public.purchase_orders
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org purchase orders" ON public.purchase_orders
  FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for PO Lines
CREATE POLICY "Users can view PO lines for their orders" ON public.purchase_order_lines
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM purchase_orders po WHERE po.id = purchase_order_lines.purchase_order_id AND po.org_id = get_user_org_id()
  ));

CREATE POLICY "Users can manage PO lines for their orders" ON public.purchase_order_lines
  FOR ALL USING (EXISTS (
    SELECT 1 FROM purchase_orders po WHERE po.id = purchase_order_lines.purchase_order_id AND po.org_id = get_user_org_id()
  ));

-- RLS Policies for Goods Receipts
CREATE POLICY "Users can view their org goods receipts" ON public.goods_receipts
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org goods receipts" ON public.goods_receipts
  FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for GR Lines
CREATE POLICY "Users can view GR lines for their receipts" ON public.goods_receipt_lines
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM goods_receipts gr WHERE gr.id = goods_receipt_lines.goods_receipt_id AND gr.org_id = get_user_org_id()
  ));

CREATE POLICY "Users can manage GR lines for their receipts" ON public.goods_receipt_lines
  FOR ALL USING (EXISTS (
    SELECT 1 FROM goods_receipts gr WHERE gr.id = goods_receipt_lines.goods_receipt_id AND gr.org_id = get_user_org_id()
  ));

-- RLS Policies for Payment Runs
CREATE POLICY "Users can view their org payment runs" ON public.payment_runs
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org payment runs" ON public.payment_runs
  FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for Payment Run Items
CREATE POLICY "Users can view payment run items for their runs" ON public.payment_run_items
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM payment_runs pr WHERE pr.id = payment_run_items.payment_run_id AND pr.org_id = get_user_org_id()
  ));

CREATE POLICY "Users can manage payment run items for their runs" ON public.payment_run_items
  FOR ALL USING (EXISTS (
    SELECT 1 FROM payment_runs pr WHERE pr.id = payment_run_items.payment_run_id AND pr.org_id = get_user_org_id()
  ));

-- Triggers for updated_at
CREATE TRIGGER update_purchase_orders_updated_at BEFORE UPDATE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_goods_receipts_updated_at BEFORE UPDATE ON public.goods_receipts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_payment_runs_updated_at BEFORE UPDATE ON public.payment_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();