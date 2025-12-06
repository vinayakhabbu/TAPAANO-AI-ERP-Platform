-- Consignment Inventory: Track consumption/transfer of consignment stock
CREATE TABLE public.consignment_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  vendor_id UUID NOT NULL REFERENCES public.vendors(id),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('received', 'consumed', 'returned', 'transferred')),
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total_value NUMERIC GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  reference_type TEXT,
  reference_id UUID,
  notes TEXT,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Inventory Receipts: Manual inventory adjustments
CREATE TABLE public.inventory_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  receipt_number TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  receipt_type TEXT NOT NULL CHECK (receipt_type IN ('adjustment_in', 'adjustment_out', 'initial_stock', 'count_adjustment', 'damage', 'return')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
  receipt_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  posted_at TIMESTAMP WITH TIME ZONE,
  posted_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID
);

-- Inventory Receipt Lines
CREATE TABLE public.inventory_receipt_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  receipt_id UUID NOT NULL REFERENCES public.inventory_receipts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  bin_location_id UUID REFERENCES public.bin_locations(id),
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total_value NUMERIC GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  reason TEXT,
  batch_lot_id UUID REFERENCES public.batch_lots(id),
  serial_number_id UUID REFERENCES public.serial_numbers(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.consignment_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_receipt_lines ENABLE ROW LEVEL SECURITY;

-- RLS Policies for consignment_transactions
CREATE POLICY "Users can view their org consignment transactions"
  ON public.consignment_transactions FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org consignment transactions"
  ON public.consignment_transactions FOR ALL
  USING (org_id = get_user_org_id());

-- RLS Policies for inventory_receipts
CREATE POLICY "Users can view their org inventory receipts"
  ON public.inventory_receipts FOR SELECT
  USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org inventory receipts"
  ON public.inventory_receipts FOR ALL
  USING (org_id = get_user_org_id());

-- RLS Policies for inventory_receipt_lines
CREATE POLICY "Users can view receipt lines for their receipts"
  ON public.inventory_receipt_lines FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM inventory_receipts ir
    WHERE ir.id = inventory_receipt_lines.receipt_id
    AND ir.org_id = get_user_org_id()
  ));

CREATE POLICY "Users can manage receipt lines for their receipts"
  ON public.inventory_receipt_lines FOR ALL
  USING (EXISTS (
    SELECT 1 FROM inventory_receipts ir
    WHERE ir.id = inventory_receipt_lines.receipt_id
    AND ir.org_id = get_user_org_id()
  ));

-- Trigger to update inventory on posted receipt
CREATE OR REPLACE FUNCTION public.update_inventory_on_receipt_post()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line RECORD;
  v_warehouse_id UUID;
BEGIN
  -- Only process when status changes to 'posted'
  IF NEW.status = 'posted' AND (OLD.status IS NULL OR OLD.status != 'posted') THEN
    v_warehouse_id := NEW.warehouse_id;
    
    -- Process each line
    FOR v_line IN 
      SELECT * FROM inventory_receipt_lines WHERE receipt_id = NEW.id
    LOOP
      -- Upsert inventory stock
      INSERT INTO inventory_stock (
        org_id, product_id, warehouse_id, bin_location_id,
        quantity_on_hand, quantity_reserved, unit_cost
      )
      VALUES (
        NEW.org_id, v_line.product_id, v_warehouse_id, v_line.bin_location_id,
        v_line.quantity, 0, v_line.unit_cost
      )
      ON CONFLICT (product_id, warehouse_id) 
      DO UPDATE SET
        quantity_on_hand = inventory_stock.quantity_on_hand + v_line.quantity,
        updated_at = now();
      
      -- Record the transaction
      INSERT INTO inventory_transactions (
        org_id, product_id, warehouse_id, bin_location_id,
        transaction_type, quantity, unit_cost,
        reference_type, reference_id, notes
      )
      VALUES (
        NEW.org_id, v_line.product_id, v_warehouse_id, v_line.bin_location_id,
        CASE 
          WHEN v_line.quantity > 0 THEN 'receipt_in'
          ELSE 'receipt_out'
        END,
        v_line.quantity, v_line.unit_cost,
        'inventory_receipt', NEW.id, v_line.reason
      );
    END LOOP;
    
    -- Update posted timestamp
    NEW.posted_at := now();
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_inventory_receipt_post
  BEFORE UPDATE ON public.inventory_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_inventory_on_receipt_post();

-- Updated_at trigger for inventory_receipts
CREATE TRIGGER update_inventory_receipts_updated_at
  BEFORE UPDATE ON public.inventory_receipts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();