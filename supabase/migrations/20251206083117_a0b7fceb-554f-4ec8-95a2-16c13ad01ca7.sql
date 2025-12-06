-- Create inventory valuation method enum
CREATE TYPE inventory_valuation_method AS ENUM ('fifo', 'lifo', 'average');

-- Create transfer status enum  
CREATE TYPE transfer_status AS ENUM ('draft', 'pending', 'in_transit', 'completed', 'cancelled');

-- Create cycle count status enum
CREATE TYPE cycle_count_status AS ENUM ('scheduled', 'in_progress', 'completed', 'cancelled');

-- Warehouses table
CREATE TABLE public.warehouses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org warehouses" ON public.warehouses
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org warehouses" ON public.warehouses
  FOR ALL USING (org_id = get_user_org_id());

-- Bin locations table (sub-zones within warehouses)
CREATE TABLE public.bin_locations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT,
  zone TEXT,
  aisle TEXT,
  rack TEXT,
  shelf TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.bin_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view bin locations for their warehouses" ON public.bin_locations
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.warehouses w 
    WHERE w.id = bin_locations.warehouse_id AND w.org_id = get_user_org_id()
  ));

CREATE POLICY "Users can manage bin locations for their warehouses" ON public.bin_locations
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.warehouses w 
    WHERE w.id = bin_locations.warehouse_id AND w.org_id = get_user_org_id()
  ));

-- Products/Items table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  sku TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  unit_of_measure TEXT NOT NULL DEFAULT 'EA',
  valuation_method inventory_valuation_method NOT NULL DEFAULT 'average',
  standard_cost NUMERIC NOT NULL DEFAULT 0,
  reorder_point NUMERIC DEFAULT 0,
  reorder_quantity NUMERIC DEFAULT 0,
  is_serialized BOOLEAN NOT NULL DEFAULT false,
  is_batch_tracked BOOLEAN NOT NULL DEFAULT false,
  is_consignment BOOLEAN NOT NULL DEFAULT false,
  consignment_vendor_id UUID,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, sku)
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org products" ON public.products
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org products" ON public.products
  FOR ALL USING (org_id = get_user_org_id());

-- Inventory stock table (current quantities by location)
CREATE TABLE public.inventory_stock (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  bin_location_id UUID REFERENCES public.bin_locations(id),
  quantity_on_hand NUMERIC NOT NULL DEFAULT 0,
  quantity_reserved NUMERIC NOT NULL DEFAULT 0,
  quantity_available NUMERIC GENERATED ALWAYS AS (quantity_on_hand - quantity_reserved) STORED,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total_value NUMERIC GENERATED ALWAYS AS (quantity_on_hand * unit_cost) STORED,
  last_count_date TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(product_id, warehouse_id, bin_location_id)
);

ALTER TABLE public.inventory_stock ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org inventory stock" ON public.inventory_stock
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org inventory stock" ON public.inventory_stock
  FOR ALL USING (org_id = get_user_org_id());

-- Stock transfers between warehouses
CREATE TABLE public.stock_transfers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  transfer_number TEXT NOT NULL,
  from_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  to_warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  from_bin_id UUID REFERENCES public.bin_locations(id),
  to_bin_id UUID REFERENCES public.bin_locations(id),
  status transfer_status NOT NULL DEFAULT 'draft',
  transfer_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_arrival_date DATE,
  actual_arrival_date DATE,
  notes TEXT,
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org stock transfers" ON public.stock_transfers
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org stock transfers" ON public.stock_transfers
  FOR ALL USING (org_id = get_user_org_id());

-- Stock transfer lines
CREATE TABLE public.stock_transfer_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transfer_id UUID NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  quantity_requested NUMERIC NOT NULL DEFAULT 0,
  quantity_shipped NUMERIC NOT NULL DEFAULT 0,
  quantity_received NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_transfer_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view transfer lines for their transfers" ON public.stock_transfer_lines
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.stock_transfers t
    WHERE t.id = stock_transfer_lines.transfer_id AND t.org_id = get_user_org_id()
  ));

CREATE POLICY "Users can manage transfer lines for their transfers" ON public.stock_transfer_lines
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.stock_transfers t
    WHERE t.id = stock_transfer_lines.transfer_id AND t.org_id = get_user_org_id()
  ));

-- Cycle counts
CREATE TABLE public.cycle_counts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  count_number TEXT NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  status cycle_count_status NOT NULL DEFAULT 'scheduled',
  scheduled_date DATE NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  counted_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cycle_counts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org cycle counts" ON public.cycle_counts
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org cycle counts" ON public.cycle_counts
  FOR ALL USING (org_id = get_user_org_id());

-- Cycle count lines
CREATE TABLE public.cycle_count_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cycle_count_id UUID NOT NULL REFERENCES public.cycle_counts(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  bin_location_id UUID REFERENCES public.bin_locations(id),
  expected_quantity NUMERIC NOT NULL DEFAULT 0,
  counted_quantity NUMERIC,
  variance NUMERIC GENERATED ALWAYS AS (COALESCE(counted_quantity, 0) - expected_quantity) STORED,
  variance_value NUMERIC,
  counted_at TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.cycle_count_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view count lines for their counts" ON public.cycle_count_lines
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.cycle_counts c
    WHERE c.id = cycle_count_lines.cycle_count_id AND c.org_id = get_user_org_id()
  ));

CREATE POLICY "Users can manage count lines for their counts" ON public.cycle_count_lines
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.cycle_counts c
    WHERE c.id = cycle_count_lines.cycle_count_id AND c.org_id = get_user_org_id()
  ));

-- Serial numbers tracking
CREATE TABLE public.serial_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  serial_number TEXT NOT NULL,
  warehouse_id UUID REFERENCES public.warehouses(id),
  bin_location_id UUID REFERENCES public.bin_locations(id),
  status TEXT NOT NULL DEFAULT 'available',
  received_date DATE,
  sold_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, product_id, serial_number)
);

ALTER TABLE public.serial_numbers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org serial numbers" ON public.serial_numbers
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org serial numbers" ON public.serial_numbers
  FOR ALL USING (org_id = get_user_org_id());

-- Batch/Lot tracking
CREATE TABLE public.batch_lots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_number TEXT NOT NULL,
  warehouse_id UUID REFERENCES public.warehouses(id),
  bin_location_id UUID REFERENCES public.bin_locations(id),
  quantity NUMERIC NOT NULL DEFAULT 0,
  manufacture_date DATE,
  expiry_date DATE,
  received_date DATE,
  status TEXT NOT NULL DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(org_id, product_id, batch_number)
);

ALTER TABLE public.batch_lots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org batch lots" ON public.batch_lots
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org batch lots" ON public.batch_lots
  FOR ALL USING (org_id = get_user_org_id());

-- Inventory transactions (movement history)
CREATE TABLE public.inventory_transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  product_id UUID NOT NULL REFERENCES public.products(id),
  warehouse_id UUID NOT NULL REFERENCES public.warehouses(id),
  bin_location_id UUID REFERENCES public.bin_locations(id),
  transaction_type TEXT NOT NULL,
  reference_type TEXT,
  reference_id UUID,
  quantity NUMERIC NOT NULL,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  total_value NUMERIC GENERATED ALWAYS AS (quantity * unit_cost) STORED,
  running_balance NUMERIC,
  serial_number_id UUID REFERENCES public.serial_numbers(id),
  batch_lot_id UUID REFERENCES public.batch_lots(id),
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their org inventory transactions" ON public.inventory_transactions
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can insert their org inventory transactions" ON public.inventory_transactions
  FOR INSERT WITH CHECK (org_id = get_user_org_id());

-- Create triggers for updated_at
CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_bin_locations_updated_at BEFORE UPDATE ON public.bin_locations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_inventory_stock_updated_at BEFORE UPDATE ON public.inventory_stock
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_stock_transfers_updated_at BEFORE UPDATE ON public.stock_transfers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_cycle_counts_updated_at BEFORE UPDATE ON public.cycle_counts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_serial_numbers_updated_at BEFORE UPDATE ON public.serial_numbers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_batch_lots_updated_at BEFORE UPDATE ON public.batch_lots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Create indexes for performance
CREATE INDEX idx_products_org_id ON public.products(org_id);
CREATE INDEX idx_products_sku ON public.products(sku);
CREATE INDEX idx_inventory_stock_product ON public.inventory_stock(product_id);
CREATE INDEX idx_inventory_stock_warehouse ON public.inventory_stock(warehouse_id);
CREATE INDEX idx_stock_transfers_org ON public.stock_transfers(org_id);
CREATE INDEX idx_cycle_counts_org ON public.cycle_counts(org_id);
CREATE INDEX idx_serial_numbers_product ON public.serial_numbers(product_id);
CREATE INDEX idx_batch_lots_product ON public.batch_lots(product_id);
CREATE INDEX idx_inventory_transactions_product ON public.inventory_transactions(product_id);
CREATE INDEX idx_inventory_transactions_warehouse ON public.inventory_transactions(warehouse_id);