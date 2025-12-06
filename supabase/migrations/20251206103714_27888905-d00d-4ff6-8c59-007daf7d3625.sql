
-- Add planning strategy enum
CREATE TYPE public.planning_strategy AS ENUM ('mts', 'mto');

-- Add stock type enum for goods receipts
CREATE TYPE public.goods_receipt_stock_type AS ENUM ('unrestricted', 'sales_order_stock');

-- Add partially_delivered status to production_order_status
ALTER TYPE public.production_order_status ADD VALUE 'partially_delivered' AFTER 'in_progress';

-- Add planning_strategy to products
ALTER TABLE public.products ADD COLUMN planning_strategy public.planning_strategy NOT NULL DEFAULT 'mts';

-- Add MTO linkage to production orders (optional sales order reference)
ALTER TABLE public.production_orders 
  ADD COLUMN sales_order_id uuid REFERENCES public.sales_orders(id),
  ADD COLUMN sales_order_item_id uuid REFERENCES public.sales_order_lines(id),
  ADD COLUMN confirmed_quantity numeric NOT NULL DEFAULT 0;

-- Create production goods receipts table
CREATE TABLE public.production_goods_receipts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  receipt_number text NOT NULL,
  production_order_id uuid NOT NULL REFERENCES public.production_orders(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  quantity numeric NOT NULL,
  uom text NOT NULL DEFAULT 'EA',
  posting_date timestamptz NOT NULL DEFAULT now(),
  stock_type public.goods_receipt_stock_type NOT NULL,
  sales_order_id uuid REFERENCES public.sales_orders(id),
  sales_order_item_id uuid REFERENCES public.sales_order_lines(id),
  warehouse_id uuid REFERENCES public.warehouses(id),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT valid_quantity CHECK (quantity > 0)
);

-- Add stock_type and sales order ref to inventory_stock
ALTER TABLE public.inventory_stock 
  ADD COLUMN stock_type public.goods_receipt_stock_type NOT NULL DEFAULT 'unrestricted',
  ADD COLUMN sales_order_id uuid REFERENCES public.sales_orders(id),
  ADD COLUMN sales_order_item_id uuid REFERENCES public.sales_order_lines(id);

-- Enable RLS
ALTER TABLE public.production_goods_receipts ENABLE ROW LEVEL SECURITY;

-- RLS policies for production_goods_receipts
CREATE POLICY "Users can view their org production goods receipts"
  ON public.production_goods_receipts FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org production goods receipts"
  ON public.production_goods_receipts FOR ALL
  USING (org_id = get_user_org_id());

-- Function to post goods receipt from production with MTS/MTO logic
CREATE OR REPLACE FUNCTION public.post_production_goods_receipt(
  p_org_id uuid,
  p_production_order_id uuid,
  p_quantity numeric,
  p_warehouse_id uuid,
  p_created_by uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_production_order RECORD;
  v_product RECORD;
  v_receipt_id uuid;
  v_receipt_number text;
  v_stock_type public.goods_receipt_stock_type;
  v_new_confirmed_qty numeric;
  v_warehouse uuid;
BEGIN
  -- Get production order
  SELECT * INTO v_production_order FROM production_orders WHERE id = p_production_order_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production order not found';
  END IF;
  
  -- Verify status allows goods receipt
  IF v_production_order.status NOT IN ('released', 'in_progress', 'partially_delivered') THEN
    RAISE EXCEPTION 'Production order status does not allow goods receipt';
  END IF;
  
  -- Get product with planning strategy
  SELECT * INTO v_product FROM products WHERE id = v_production_order.product_id;
  
  -- Determine stock type based on planning strategy
  IF v_product.planning_strategy = 'mto' THEN
    v_stock_type := 'sales_order_stock';
  ELSE
    v_stock_type := 'unrestricted';
  END IF;
  
  -- Check over-delivery
  v_new_confirmed_qty := v_production_order.confirmed_quantity + p_quantity;
  IF v_new_confirmed_qty > v_production_order.planned_quantity THEN
    RAISE EXCEPTION 'Goods receipt would exceed planned quantity';
  END IF;
  
  v_warehouse := COALESCE(p_warehouse_id, v_production_order.warehouse_id);
  
  -- Generate receipt number
  v_receipt_number := 'PGR-' || to_char(now(), 'YYYYMMDD') || '-' || 
    lpad((floor(random() * 10000))::text, 4, '0');
  
  -- Create goods receipt
  INSERT INTO production_goods_receipts (
    org_id, receipt_number, production_order_id, product_id,
    quantity, uom, stock_type, sales_order_id, sales_order_item_id,
    warehouse_id, created_by
  ) VALUES (
    p_org_id, v_receipt_number, p_production_order_id, v_production_order.product_id,
    p_quantity, v_product.unit_of_measure, v_stock_type,
    v_production_order.sales_order_id, v_production_order.sales_order_item_id,
    v_warehouse, p_created_by
  ) RETURNING id INTO v_receipt_id;
  
  -- Update production order confirmed quantity and status
  UPDATE production_orders SET
    confirmed_quantity = v_new_confirmed_qty,
    status = CASE
      WHEN v_new_confirmed_qty < planned_quantity THEN 'partially_delivered'::production_order_status
      WHEN v_new_confirmed_qty >= planned_quantity THEN 'completed'::production_order_status
      ELSE status
    END,
    updated_at = now()
  WHERE id = p_production_order_id;
  
  -- Update inventory with appropriate stock type
  INSERT INTO inventory_stock (
    org_id, product_id, warehouse_id, quantity_on_hand, quantity_reserved, 
    unit_cost, stock_type, sales_order_id, sales_order_item_id
  ) VALUES (
    p_org_id, v_production_order.product_id, v_warehouse,
    p_quantity, 0, v_product.standard_cost, v_stock_type,
    v_production_order.sales_order_id, v_production_order.sales_order_item_id
  )
  ON CONFLICT (product_id, warehouse_id) 
  DO UPDATE SET
    quantity_on_hand = inventory_stock.quantity_on_hand + p_quantity,
    updated_at = now();
  
  -- Record inventory transaction
  INSERT INTO inventory_transactions (
    org_id, product_id, warehouse_id, transaction_type, quantity, unit_cost,
    reference_type, reference_id, notes
  ) VALUES (
    p_org_id, v_production_order.product_id, v_warehouse,
    'production_receipt', p_quantity, v_product.standard_cost,
    'production_goods_receipt', v_receipt_id,
    CASE WHEN v_stock_type = 'sales_order_stock' 
      THEN 'MTO production receipt for sales order' 
      ELSE 'MTS production receipt to unrestricted stock'
    END
  );
  
  -- If MTO, update sales order item delivered quantity
  IF v_production_order.sales_order_item_id IS NOT NULL THEN
    UPDATE sales_order_lines SET
      quantity_shipped = COALESCE(quantity_shipped, 0) + p_quantity
    WHERE id = v_production_order.sales_order_item_id;
  END IF;
  
  RETURN v_receipt_id;
END;
$$;
