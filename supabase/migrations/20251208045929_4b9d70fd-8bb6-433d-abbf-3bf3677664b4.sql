
-- Create matching rules table for auto-matching
CREATE TABLE public.matching_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  name TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 100,
  is_active BOOLEAN NOT NULL DEFAULT true,
  rule_type TEXT NOT NULL DEFAULT 'contains', -- contains, exact, regex, amount_range
  field_to_match TEXT NOT NULL DEFAULT 'description', -- description, amount, both
  match_pattern TEXT NOT NULL,
  match_amount_min NUMERIC,
  match_amount_max NUMERIC,
  target_account_id UUID REFERENCES public.accounts(id),
  target_cost_center_id UUID REFERENCES public.cost_centers(id),
  auto_reconcile BOOLEAN NOT NULL DEFAULT false,
  match_count INTEGER NOT NULL DEFAULT 0,
  last_matched_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create bank statement imports table
CREATE TABLE public.bank_statement_imports (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- ofx, qfx, csv
  import_date TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  total_transactions INTEGER NOT NULL DEFAULT 0,
  imported_transactions INTEGER NOT NULL DEFAULT 0,
  duplicate_transactions INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  statement_start_date DATE,
  statement_end_date DATE,
  imported_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create positive pay checks table for fraud prevention
CREATE TABLE public.positive_pay_checks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id),
  check_number TEXT NOT NULL,
  payee_name TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  issue_date DATE NOT NULL,
  void_date DATE,
  status TEXT NOT NULL DEFAULT 'issued', -- issued, presented, paid, void, exception
  presented_amount NUMERIC,
  presented_date DATE,
  exception_reason TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by UUID,
  bill_id UUID REFERENCES public.bills(id),
  payment_run_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create bank feed connections table
CREATE TABLE public.bank_feed_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES public.organizations(id),
  bank_account_id UUID NOT NULL REFERENCES public.bank_accounts(id),
  provider TEXT NOT NULL DEFAULT 'manual', -- manual, plaid, yodlee, mx
  connection_status TEXT NOT NULL DEFAULT 'disconnected', -- connected, disconnected, error, pending
  last_sync_at TIMESTAMP WITH TIME ZONE,
  last_sync_status TEXT,
  sync_frequency TEXT NOT NULL DEFAULT 'daily', -- hourly, daily, manual
  auto_import BOOLEAN NOT NULL DEFAULT true,
  connection_metadata JSONB,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.matching_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.positive_pay_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_feed_connections ENABLE ROW LEVEL SECURITY;

-- RLS Policies for matching_rules
CREATE POLICY "Users can view their org matching rules" ON public.matching_rules
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org matching rules" ON public.matching_rules
  FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for bank_statement_imports
CREATE POLICY "Users can view their org statement imports" ON public.bank_statement_imports
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org statement imports" ON public.bank_statement_imports
  FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for positive_pay_checks
CREATE POLICY "Users can view their org positive pay checks" ON public.positive_pay_checks
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org positive pay checks" ON public.positive_pay_checks
  FOR ALL USING (org_id = get_user_org_id());

-- RLS Policies for bank_feed_connections
CREATE POLICY "Users can view their org bank feed connections" ON public.bank_feed_connections
  FOR SELECT USING (org_id = get_user_org_id());

CREATE POLICY "Users can manage their org bank feed connections" ON public.bank_feed_connections
  FOR ALL USING (org_id = get_user_org_id());

-- Add rule_id to bank_transactions for tracking which rule matched
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS matched_rule_id UUID REFERENCES public.matching_rules(id);
ALTER TABLE public.bank_transactions ADD COLUMN IF NOT EXISTS import_id UUID REFERENCES public.bank_statement_imports(id);

-- Create function to auto-match transactions based on rules
CREATE OR REPLACE FUNCTION apply_matching_rules(p_transaction_id UUID)
RETURNS UUID AS $$
DECLARE
  v_transaction RECORD;
  v_rule RECORD;
  v_matched_rule_id UUID;
BEGIN
  -- Get the transaction
  SELECT * INTO v_transaction 
  FROM bank_transactions 
  WHERE id = p_transaction_id AND status = 'pending';
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  
  -- Find matching rule (highest priority first)
  FOR v_rule IN 
    SELECT * FROM matching_rules 
    WHERE org_id = v_transaction.org_id 
      AND is_active = true
    ORDER BY priority ASC, created_at ASC
  LOOP
    -- Check if rule matches based on rule type
    IF v_rule.rule_type = 'contains' AND v_rule.field_to_match = 'description' THEN
      IF v_transaction.description ILIKE '%' || v_rule.match_pattern || '%' THEN
        v_matched_rule_id := v_rule.id;
        EXIT;
      END IF;
    ELSIF v_rule.rule_type = 'exact' AND v_rule.field_to_match = 'description' THEN
      IF v_transaction.description ILIKE v_rule.match_pattern THEN
        v_matched_rule_id := v_rule.id;
        EXIT;
      END IF;
    ELSIF v_rule.rule_type = 'amount_range' THEN
      IF v_transaction.amount >= COALESCE(v_rule.match_amount_min, v_transaction.amount)
         AND v_transaction.amount <= COALESCE(v_rule.match_amount_max, v_transaction.amount) THEN
        IF v_rule.field_to_match = 'amount' OR 
           (v_rule.field_to_match = 'both' AND v_transaction.description ILIKE '%' || v_rule.match_pattern || '%') THEN
          v_matched_rule_id := v_rule.id;
          EXIT;
        END IF;
      END IF;
    END IF;
  END LOOP;
  
  -- If a rule matched, update the transaction
  IF v_matched_rule_id IS NOT NULL THEN
    UPDATE bank_transactions 
    SET matched_rule_id = v_matched_rule_id,
        suggested_account_id = (SELECT target_account_id FROM matching_rules WHERE id = v_matched_rule_id),
        status = CASE WHEN (SELECT auto_reconcile FROM matching_rules WHERE id = v_matched_rule_id) THEN 'matched' ELSE 'pending' END,
        updated_at = now()
    WHERE id = p_transaction_id;
    
    -- Update rule match count
    UPDATE matching_rules 
    SET match_count = match_count + 1, 
        last_matched_at = now(),
        updated_at = now()
    WHERE id = v_matched_rule_id;
  END IF;
  
  RETURN v_matched_rule_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
