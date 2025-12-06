-- Function to update inventory when goods are received
CREATE OR REPLACE FUNCTION public.update_inventory_on_goods_receipt()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_product_id UUID;
  v_warehouse_id UUID;
  v_unit_cost NUMERIC;
  v_po_line RECORD;
BEGIN
  -- Get the PO line details
  SELECT pol.*, po.org_id, po.entity_id
  INTO v_po_line
  FROM purchase_order_lines pol
  JOIN purchase_orders po ON po.id = pol.purchase_order_id
  WHERE pol.id = NEW.purchase_order_line_id;

  v_org_id := v_po_line.org_id;
  
  -- For now, we'll use a default warehouse - in production you'd specify this
  SELECT id INTO v_warehouse_id 
  FROM warehouses 
  WHERE org_id = v_org_id AND is_active = true 
  LIMIT 1;
  
  -- Try to find matching product by description (simplified matching)
  SELECT id, standard_cost INTO v_product_id, v_unit_cost
  FROM products 
  WHERE org_id = v_org_id AND is_active = true
  LIMIT 1;
  
  -- If we have a warehouse and product, update inventory
  IF v_warehouse_id IS NOT NULL AND v_product_id IS NOT NULL THEN
    -- Upsert inventory stock
    INSERT INTO inventory_stock (
      org_id, product_id, warehouse_id, quantity_on_hand, quantity_reserved, unit_cost
    )
    VALUES (
      v_org_id, v_product_id, v_warehouse_id, NEW.quantity_received, 0, COALESCE(v_unit_cost, v_po_line.unit_price)
    )
    ON CONFLICT (product_id, warehouse_id) 
    DO UPDATE SET
      quantity_on_hand = inventory_stock.quantity_on_hand + NEW.quantity_received,
      updated_at = now();
    
    -- Record the transaction
    INSERT INTO inventory_transactions (
      org_id, product_id, warehouse_id, transaction_type, quantity, unit_cost, 
      reference_type, reference_id, notes
    )
    VALUES (
      v_org_id, v_product_id, v_warehouse_id, 'receipt', NEW.quantity_received, 
      COALESCE(v_unit_cost, v_po_line.unit_price),
      'goods_receipt', NEW.goods_receipt_id, 'Auto-created from goods receipt'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Function to update inventory when items are shipped
CREATE OR REPLACE FUNCTION public.update_inventory_on_shipment()
RETURNS TRIGGER AS $$
DECLARE
  v_org_id UUID;
  v_product_id UUID;
  v_warehouse_id UUID;
  v_unit_cost NUMERIC;
  v_so_line RECORD;
BEGIN
  -- Get the SO line details
  SELECT sol.*, so.org_id, so.entity_id
  INTO v_so_line
  FROM sales_order_lines sol
  JOIN sales_orders so ON so.id = sol.sales_order_id
  WHERE sol.id = NEW.sales_order_line_id;

  v_org_id := v_so_line.org_id;
  
  -- Get default warehouse
  SELECT id INTO v_warehouse_id 
  FROM warehouses 
  WHERE org_id = v_org_id AND is_active = true 
  LIMIT 1;
  
  -- Try to find matching product
  SELECT id, standard_cost INTO v_product_id, v_unit_cost
  FROM products 
  WHERE org_id = v_org_id AND is_active = true
  LIMIT 1;
  
  -- If we have inventory, reduce it
  IF v_warehouse_id IS NOT NULL AND v_product_id IS NOT NULL THEN
    -- Update inventory stock (reduce quantity)
    UPDATE inventory_stock
    SET 
      quantity_on_hand = GREATEST(0, quantity_on_hand - NEW.quantity_shipped),
      updated_at = now()
    WHERE product_id = v_product_id AND warehouse_id = v_warehouse_id;
    
    -- Record the transaction (negative quantity for outbound)
    INSERT INTO inventory_transactions (
      org_id, product_id, warehouse_id, transaction_type, quantity, unit_cost,
      reference_type, reference_id, notes
    )
    VALUES (
      v_org_id, v_product_id, v_warehouse_id, 'shipment', -NEW.quantity_shipped,
      COALESCE(v_unit_cost, 0),
      'shipment', NEW.shipment_id, 'Auto-created from shipment'
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create unique constraint for inventory_stock if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inventory_stock_product_warehouse_unique'
  ) THEN
    ALTER TABLE inventory_stock ADD CONSTRAINT inventory_stock_product_warehouse_unique 
    UNIQUE (product_id, warehouse_id);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_update_inventory_on_goods_receipt ON goods_receipt_lines;
CREATE TRIGGER trigger_update_inventory_on_goods_receipt
  AFTER INSERT ON goods_receipt_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_on_goods_receipt();

DROP TRIGGER IF EXISTS trigger_update_inventory_on_shipment ON shipment_lines;
CREATE TRIGGER trigger_update_inventory_on_shipment
  AFTER INSERT ON shipment_lines
  FOR EACH ROW
  EXECUTE FUNCTION update_inventory_on_shipment();