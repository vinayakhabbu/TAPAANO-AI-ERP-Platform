-- Phase 5: Core Financial Automation Tables

-- ============================================
-- ALLOCATIONS ENGINE
-- ============================================

-- Allocation Rules - defines how costs are distributed
CREATE TABLE public.allocation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  source_account_id UUID REFERENCES public.accounts(id),
  allocation_method TEXT NOT NULL DEFAULT 'percentage', -- percentage, headcount, revenue, custom
  run_frequency TEXT NOT NULL DEFAULT 'monthly', -- monthly, quarterly, period_end, manual
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Allocation Rule Targets - distribution percentages per rule
CREATE TABLE public.allocation_rule_targets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  rule_id UUID NOT NULL REFERENCES public.allocation_rules(id) ON DELETE CASCADE,
  target_cost_center_id UUID REFERENCES public.cost_centers(id),
  target_project_id UUID REFERENCES public.projects(id),
  target_account_id UUID REFERENCES public.accounts(id),
  percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  formula TEXT, -- for custom allocation methods
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Allocation Runs - execution history
CREATE TABLE public.allocation_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  rule_id UUID NOT NULL REFERENCES public.allocation_rules(id),
  run_date DATE NOT NULL DEFAULT CURRENT_DATE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  source_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, completed, failed, reversed
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE
);

-- ============================================
-- PREPAID EXPENSES & AMORTIZATION
-- ============================================

-- Prepaid Expenses Master
CREATE TABLE public.prepaid_expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  entity_id UUID NOT NULL REFERENCES public.entities(id),
  vendor_id UUID REFERENCES public.vendors(id),
  description TEXT NOT NULL,
  reference_number TEXT,
  original_amount NUMERIC(15,2) NOT NULL,
  remaining_amount NUMERIC(15,2) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  amortization_method TEXT NOT NULL DEFAULT 'straight_line', -- straight_line, custom
  prepaid_account_id UUID REFERENCES public.accounts(id),
  expense_account_id UUID REFERENCES public.accounts(id),
  cost_center_id UUID REFERENCES public.cost_centers(id),
  status TEXT NOT NULL DEFAULT 'active', -- active, fully_amortized, cancelled
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Amortization Schedule
CREATE TABLE public.amortization_schedule (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  prepaid_expense_id UUID NOT NULL REFERENCES public.prepaid_expenses(id) ON DELETE CASCADE,
  period_date DATE NOT NULL,
  amount NUMERIC(15,2) NOT NULL,
  cumulative_amount NUMERIC(15,2) NOT NULL DEFAULT 0,
  remaining_balance NUMERIC(15,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, posted, skipped
  journal_entry_id UUID REFERENCES public.journal_entries(id),
  posted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================
-- INVENTORY MOVEMENTS (for COGS tracking)
-- ============================================

CREATE TABLE public.inventory_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  product_id UUID NOT NULL REFERENCES public.products(id),
  warehouse_id UUID REFERENCES public.warehouses(id),
  movement_type TEXT NOT NULL, -- purchase, sale, adjustment, transfer_in, transfer_out, production_in, production_out
  quantity NUMERIC(15,4) NOT NULL,
  unit_cost NUMERIC(15,4) NOT NULL DEFAULT 0,
  total_cost NUMERIC(15,2) NOT NULL DEFAULT 0,
  reference_type TEXT, -- goods_receipt, shipment, stock_transfer, production_order, adjustment
  reference_id UUID,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================
-- SCHEDULED REPORTS
-- ============================================

CREATE TABLE public.scheduled_reports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  report_type TEXT NOT NULL, -- income_statement, balance_sheet, cash_flow, trial_balance, ar_aging, ap_aging
  report_config JSONB NOT NULL DEFAULT '{}', -- filters, date range options, etc.
  schedule_frequency TEXT NOT NULL DEFAULT 'weekly', -- daily, weekly, monthly
  schedule_day INTEGER, -- day of week (0-6) or day of month (1-31)
  schedule_time TIME NOT NULL DEFAULT '08:00',
  recipients TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================
-- BANK CONNECTIONS (for Plaid Integration)
-- ============================================

CREATE TABLE public.bank_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  bank_account_id UUID REFERENCES public.bank_accounts(id),
  provider TEXT NOT NULL DEFAULT 'plaid',
  institution_id TEXT,
  institution_name TEXT,
  plaid_item_id TEXT,
  access_token_encrypted TEXT, -- encrypted access token
  connection_status TEXT NOT NULL DEFAULT 'pending', -- pending, connected, error, expired
  last_sync_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================
-- INTEGRATIONS (Third-Party Connectors)
-- ============================================

CREATE TABLE public.integrations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  integration_type TEXT NOT NULL, -- salesforce, hubspot, shopify, quickbooks_payroll
  name TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}',
  credentials_encrypted TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  last_sync_at TIMESTAMP WITH TIME ZONE,
  sync_status TEXT DEFAULT 'pending', -- pending, syncing, success, error
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.integration_sync_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  integration_id UUID NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  sync_type TEXT NOT NULL, -- full, incremental
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  records_processed INTEGER DEFAULT 0,
  records_created INTEGER DEFAULT 0,
  records_updated INTEGER DEFAULT 0,
  records_failed INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running', -- running, completed, failed
  error_details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================
-- CASH FLOW & REVENUE PREDICTIONS
-- ============================================

CREATE TABLE public.cash_flow_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  entity_id UUID REFERENCES public.entities(id),
  prediction_date DATE NOT NULL,
  forecast_date DATE NOT NULL, -- the date being predicted
  predicted_inflow NUMERIC(15,2) NOT NULL DEFAULT 0,
  predicted_outflow NUMERIC(15,2) NOT NULL DEFAULT 0,
  predicted_balance NUMERIC(15,2) NOT NULL DEFAULT 0,
  confidence_score NUMERIC(5,2) DEFAULT 0.8,
  factors JSONB, -- what influenced the prediction
  model_version TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.revenue_predictions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  prediction_date DATE NOT NULL,
  forecast_period TEXT NOT NULL, -- '2026-Q1', '2026-02', etc.
  predicted_revenue NUMERIC(15,2) NOT NULL DEFAULT 0,
  predicted_pipeline_value NUMERIC(15,2) NOT NULL DEFAULT 0,
  weighted_pipeline NUMERIC(15,2) NOT NULL DEFAULT 0,
  confidence_score NUMERIC(5,2) DEFAULT 0.8,
  factors JSONB, -- pipeline breakdown, historical patterns, etc.
  model_version TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.allocation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocation_rule_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.allocation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prepaid_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.amortization_schedule ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integration_sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_flow_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.revenue_predictions ENABLE ROW LEVEL SECURITY;

-- Allocation Rules policies
CREATE POLICY "Users can view allocation rules for their org" ON public.allocation_rules
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage allocation rules" ON public.allocation_rules
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Allocation Rule Targets policies
CREATE POLICY "Users can view allocation targets" ON public.allocation_rule_targets
  FOR SELECT USING (
    rule_id IN (SELECT id FROM public.allocation_rules WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()))
  );

CREATE POLICY "Admins can manage allocation targets" ON public.allocation_rule_targets
  FOR ALL USING (
    rule_id IN (SELECT id FROM public.allocation_rules WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Allocation Runs policies
CREATE POLICY "Users can view allocation runs" ON public.allocation_runs
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage allocation runs" ON public.allocation_runs
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Prepaid Expenses policies
CREATE POLICY "Users can view prepaid expenses" ON public.prepaid_expenses
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage prepaid expenses" ON public.prepaid_expenses
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Amortization Schedule policies
CREATE POLICY "Users can view amortization schedules" ON public.amortization_schedule
  FOR SELECT USING (
    prepaid_expense_id IN (SELECT id FROM public.prepaid_expenses WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()))
  );

CREATE POLICY "Admins can manage amortization schedules" ON public.amortization_schedule
  FOR ALL USING (
    prepaid_expense_id IN (SELECT id FROM public.prepaid_expenses WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Inventory Movements policies
CREATE POLICY "Users can view inventory movements" ON public.inventory_movements
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can create inventory movements" ON public.inventory_movements
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- Scheduled Reports policies
CREATE POLICY "Users can view scheduled reports" ON public.scheduled_reports
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage scheduled reports" ON public.scheduled_reports
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Bank Connections policies (admin only - sensitive)
CREATE POLICY "Admins can view bank connections" ON public.bank_connections
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

CREATE POLICY "Admins can manage bank connections" ON public.bank_connections
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Integrations policies (admin only - sensitive)
CREATE POLICY "Admins can view integrations" ON public.integrations
  FOR SELECT USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

CREATE POLICY "Admins can manage integrations" ON public.integrations
  FOR ALL USING (
    org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Integration Sync Logs policies
CREATE POLICY "Admins can view sync logs" ON public.integration_sync_logs
  FOR SELECT USING (
    integration_id IN (SELECT id FROM public.integrations WHERE org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()))
    AND EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role IN ('admin', 'moderator')
    )
  );

-- Predictions policies (read-only for users)
CREATE POLICY "Users can view cash flow predictions" ON public.cash_flow_predictions
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "System can insert predictions" ON public.cash_flow_predictions
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view revenue predictions" ON public.revenue_predictions
  FOR SELECT USING (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "System can insert revenue predictions" ON public.revenue_predictions
  FOR INSERT WITH CHECK (org_id IN (SELECT org_id FROM public.profiles WHERE id = auth.uid()));

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX idx_allocation_rules_org ON public.allocation_rules(org_id);
CREATE INDEX idx_allocation_runs_rule ON public.allocation_runs(rule_id);
CREATE INDEX idx_allocation_runs_date ON public.allocation_runs(run_date);
CREATE INDEX idx_prepaid_expenses_org ON public.prepaid_expenses(org_id);
CREATE INDEX idx_prepaid_expenses_status ON public.prepaid_expenses(status);
CREATE INDEX idx_amortization_schedule_prepaid ON public.amortization_schedule(prepaid_expense_id);
CREATE INDEX idx_amortization_schedule_date ON public.amortization_schedule(period_date);
CREATE INDEX idx_inventory_movements_product ON public.inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_date ON public.inventory_movements(movement_date);
CREATE INDEX idx_inventory_movements_type ON public.inventory_movements(movement_type);
CREATE INDEX idx_scheduled_reports_org ON public.scheduled_reports(org_id);
CREATE INDEX idx_scheduled_reports_next_run ON public.scheduled_reports(next_run_at);
CREATE INDEX idx_bank_connections_org ON public.bank_connections(org_id);
CREATE INDEX idx_integrations_org ON public.integrations(org_id);
CREATE INDEX idx_cash_flow_predictions_date ON public.cash_flow_predictions(forecast_date);
CREATE INDEX idx_revenue_predictions_period ON public.revenue_predictions(forecast_period);