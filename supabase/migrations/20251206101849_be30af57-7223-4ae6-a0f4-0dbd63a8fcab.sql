-- Production Planning Module Tables

-- Work Centers table (production resources)
CREATE TABLE public.work_centers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  hourly_rate NUMERIC NOT NULL DEFAULT 0,
  capacity_per_day NUMERIC NOT NULL DEFAULT 8,
  efficiency_rate NUMERIC NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Bill of Materials header
CREATE TABLE public.bom_headers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  bom_number TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0',
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  effective_date DATE,
  expiry_date DATE,
  standard_quantity NUMERIC NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Bill of Materials lines (components)
CREATE TABLE public.bom_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bom_id UUID NOT NULL REFERENCES public.bom_headers(id) ON DELETE CASCADE,
  component_product_id UUID NOT NULL REFERENCES public.products(id),
  quantity NUMERIC NOT NULL DEFAULT 1,
  unit_of_measure TEXT NOT NULL DEFAULT 'EA',
  scrap_rate NUMERIC NOT NULL DEFAULT 0,
  position_number INTEGER,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- BOM operations (work center routing)
CREATE TABLE public.bom_operations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  bom_id UUID NOT NULL REFERENCES public.bom_headers(id) ON DELETE CASCADE,
  work_center_id UUID NOT NULL REFERENCES public.work_centers(id),
  operation_number INTEGER NOT NULL,
  operation_name TEXT NOT NULL,
  setup_time NUMERIC NOT NULL DEFAULT 0,
  run_time_per_unit NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Production Orders
CREATE TYPE public.production_order_status AS ENUM ('draft', 'planned', 'released', 'in_progress', 'completed', 'cancelled');

CREATE TABLE public.production_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  order_number TEXT NOT NULL,
  bom_id UUID NOT NULL REFERENCES public.bom_headers(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  warehouse_id UUID REFERENCES public.warehouses(id),
  planned_quantity NUMERIC NOT NULL DEFAULT 1,
  completed_quantity NUMERIC NOT NULL DEFAULT 0,
  scrapped_quantity NUMERIC NOT NULL DEFAULT 0,
  status production_order_status NOT NULL DEFAULT 'draft',
  priority INTEGER NOT NULL DEFAULT 5,
  planned_start_date DATE,
  planned_end_date DATE,
  actual_start_date DATE,
  actual_end_date DATE,
  notes TEXT,
  created_by UUID,
  approved_by UUID,
  approved_at TIMESTAMP WITH TIME ZONE,
  released_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Production Order components (material requirements)
CREATE TABLE public.production_order_components (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  required_quantity NUMERIC NOT NULL DEFAULT 0,
  issued_quantity NUMERIC NOT NULL DEFAULT 0,
  unit_cost NUMERIC NOT NULL DEFAULT 0,
  bin_location_id UUID REFERENCES public.bin_locations(id),
  is_backflushed BOOLEAN NOT NULL DEFAULT false,
  backflushed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Production Order operations (shop floor tracking)
CREATE TYPE public.operation_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');

CREATE TABLE public.production_order_operations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  production_order_id UUID NOT NULL REFERENCES public.production_orders(id) ON DELETE CASCADE,
  work_center_id UUID NOT NULL REFERENCES public.work_centers(id),
  operation_number INTEGER NOT NULL,
  operation_name TEXT NOT NULL,
  planned_setup_time NUMERIC NOT NULL DEFAULT 0,
  planned_run_time NUMERIC NOT NULL DEFAULT 0,
  actual_setup_time NUMERIC,
  actual_run_time NUMERIC,
  status operation_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  completed_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- MRP Runs
CREATE TABLE public.mrp_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  run_number TEXT NOT NULL,
  run_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  planning_horizon_days INTEGER NOT NULL DEFAULT 30,
  status TEXT NOT NULL DEFAULT 'running',
  total_requirements INTEGER NOT NULL DEFAULT 0,
  total_shortages INTEGER NOT NULL DEFAULT 0,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- MRP Results (material requirements)
CREATE TABLE public.mrp_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mrp_run_id UUID NOT NULL REFERENCES public.mrp_runs(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id),
  requirement_date DATE NOT NULL,
  gross_requirement NUMERIC NOT NULL DEFAULT 0,
  scheduled_receipts NUMERIC NOT NULL DEFAULT 0,
  projected_on_hand NUMERIC NOT NULL DEFAULT 0,
  net_requirement NUMERIC NOT NULL DEFAULT 0,
  planned_order_qty NUMERIC NOT NULL DEFAULT 0,
  planned_order_date DATE,
  source_type TEXT,
  source_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Capacity Planning records
CREATE TABLE public.capacity_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  work_center_id UUID NOT NULL REFERENCES public.work_centers(id),
  schedule_date DATE NOT NULL,
  available_hours NUMERIC NOT NULL DEFAULT 8,
  planned_hours NUMERIC NOT NULL DEFAULT 0,
  actual_hours NUMERIC NOT NULL DEFAULT 0,
  utilization_rate NUMERIC,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (work_center_id, schedule_date)
);

-- Enable RLS on all tables
ALTER TABLE public.work_centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bom_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_schedules ENABLE ROW LEVEL SECURITY;

-- RLS Policies for work_centers
CREATE POLICY "Users can view their org work centers" ON public.work_centers FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org work centers" ON public.work_centers FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for bom_headers
CREATE POLICY "Users can view their org BOMs" ON public.bom_headers FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org BOMs" ON public.bom_headers FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for bom_lines
CREATE POLICY "Users can view BOM lines for their BOMs" ON public.bom_lines FOR SELECT USING (EXISTS (SELECT 1 FROM bom_headers b WHERE b.id = bom_lines.bom_id AND b.org_id = get_user_org_id()));
CREATE POLICY "Users can manage BOM lines for their BOMs" ON public.bom_lines FOR ALL USING (EXISTS (SELECT 1 FROM bom_headers b WHERE b.id = bom_lines.bom_id AND b.org_id = get_user_org_id()));

-- RLS Policies for bom_operations
CREATE POLICY "Users can view BOM operations for their BOMs" ON public.bom_operations FOR SELECT USING (EXISTS (SELECT 1 FROM bom_headers b WHERE b.id = bom_operations.bom_id AND b.org_id = get_user_org_id()));
CREATE POLICY "Users can manage BOM operations for their BOMs" ON public.bom_operations FOR ALL USING (EXISTS (SELECT 1 FROM bom_headers b WHERE b.id = bom_operations.bom_id AND b.org_id = get_user_org_id()));

-- RLS Policies for production_orders
CREATE POLICY "Users can view their org production orders" ON public.production_orders FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org production orders" ON public.production_orders FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for production_order_components
CREATE POLICY "Users can view components for their orders" ON public.production_order_components FOR SELECT USING (EXISTS (SELECT 1 FROM production_orders po WHERE po.id = production_order_components.production_order_id AND po.org_id = get_user_org_id()));
CREATE POLICY "Users can manage components for their orders" ON public.production_order_components FOR ALL USING (EXISTS (SELECT 1 FROM production_orders po WHERE po.id = production_order_components.production_order_id AND po.org_id = get_user_org_id()));

-- RLS Policies for production_order_operations
CREATE POLICY "Users can view operations for their orders" ON public.production_order_operations FOR SELECT USING (EXISTS (SELECT 1 FROM production_orders po WHERE po.id = production_order_operations.production_order_id AND po.org_id = get_user_org_id()));
CREATE POLICY "Users can manage operations for their orders" ON public.production_order_operations FOR ALL USING (EXISTS (SELECT 1 FROM production_orders po WHERE po.id = production_order_operations.production_order_id AND po.org_id = get_user_org_id()));

-- RLS Policies for mrp_runs
CREATE POLICY "Users can view their org MRP runs" ON public.mrp_runs FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org MRP runs" ON public.mrp_runs FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for mrp_results
CREATE POLICY "Users can view MRP results for their runs" ON public.mrp_results FOR SELECT USING (EXISTS (SELECT 1 FROM mrp_runs r WHERE r.id = mrp_results.mrp_run_id AND r.org_id = get_user_org_id()));
CREATE POLICY "Users can manage MRP results for their runs" ON public.mrp_results FOR ALL USING (EXISTS (SELECT 1 FROM mrp_runs r WHERE r.id = mrp_results.mrp_run_id AND r.org_id = get_user_org_id()));

-- RLS Policies for capacity_schedules
CREATE POLICY "Users can view their org capacity schedules" ON public.capacity_schedules FOR SELECT USING (org_id = get_user_org_id());
CREATE POLICY "Users can manage their org capacity schedules" ON public.capacity_schedules FOR ALL USING (org_id = get_user_org_id());

-- Backflush processing function
CREATE OR REPLACE FUNCTION public.backflush_production_components()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_component RECORD;
  v_qty_to_issue NUMERIC;
BEGIN
  -- Only process when status changes to 'completed'
  IF NEW.status = 'completed' AND (OLD.status IS NULL OR OLD.status != 'completed') THEN
    -- Process each component marked for backflush
    FOR v_component IN 
      SELECT * FROM production_order_components 
      WHERE production_order_id = NEW.id AND is_backflushed = false
    LOOP
      -- Calculate quantity to issue based on completed quantity
      v_qty_to_issue := (v_component.required_quantity / NEW.planned_quantity) * NEW.completed_quantity;
      
      -- Update component as backflushed
      UPDATE production_order_components
      SET 
        issued_quantity = issued_quantity + v_qty_to_issue,
        is_backflushed = true,
        backflushed_at = now()
      WHERE id = v_component.id;
      
      -- Reduce inventory stock
      UPDATE inventory_stock
      SET 
        quantity_on_hand = GREATEST(0, quantity_on_hand - v_qty_to_issue),
        updated_at = now()
      WHERE product_id = v_component.product_id AND warehouse_id = NEW.warehouse_id;
      
      -- Record inventory transaction
      INSERT INTO inventory_transactions (
        org_id, product_id, warehouse_id, transaction_type, quantity, unit_cost,
        reference_type, reference_id, notes
      )
      VALUES (
        NEW.org_id, v_component.product_id, NEW.warehouse_id, 'backflush', 
        -v_qty_to_issue, v_component.unit_cost,
        'production_order', NEW.id, 'Backflush from production order ' || NEW.order_number
      );
    END LOOP;
    
    -- Add finished goods to inventory
    INSERT INTO inventory_stock (
      org_id, product_id, warehouse_id, quantity_on_hand, quantity_reserved, unit_cost
    )
    VALUES (
      NEW.org_id, NEW.product_id, NEW.warehouse_id, NEW.completed_quantity, 0, 0
    )
    ON CONFLICT (product_id, warehouse_id) 
    DO UPDATE SET
      quantity_on_hand = inventory_stock.quantity_on_hand + NEW.completed_quantity,
      updated_at = now();
    
    -- Record finished goods receipt
    INSERT INTO inventory_transactions (
      org_id, product_id, warehouse_id, transaction_type, quantity, unit_cost,
      reference_type, reference_id, notes
    )
    VALUES (
      NEW.org_id, NEW.product_id, NEW.warehouse_id, 'production_receipt', 
      NEW.completed_quantity, 0,
      'production_order', NEW.id, 'Production completion from order ' || NEW.order_number
    );
    
    NEW.actual_end_date := CURRENT_DATE;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create trigger for backflush
CREATE TRIGGER trigger_backflush_production
  BEFORE UPDATE ON public.production_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.backflush_production_components();