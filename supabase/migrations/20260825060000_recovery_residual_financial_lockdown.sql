-- Recovery containment for residual prototype financial workflows.
-- Listed tables are preserved but hidden and immutable until each vertical
-- slice receives tenant-lineage, atomic-posting and reconciliation controls.

BEGIN;

CREATE OR REPLACE FUNCTION public.guard_residual_financial_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'residual financial workflow is contained and immutable';
END;
$$;

DO $$
DECLARE
  target_table text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'quotations', 'quotation_lines', 'sales_orders', 'sales_order_lines',
    'shipments', 'shipment_items', 'purchase_requisitions', 'purchase_requisition_lines',
    'purchase_orders', 'purchase_order_lines', 'goods_receipts', 'goods_receipt_lines',
    'tax_jurisdictions', 'tax_codes', 'tax_rates', 'tax_transactions', 'tax_filings',
    'exchange_rates', 'currency_revaluations',
    'warehouses', 'bin_locations', 'products', 'inventory_stock', 'inventory_transactions',
    'inventory_movements', 'inventory_receipts', 'inventory_receipt_lines',
    'stock_transfers', 'stock_transfer_items', 'cycle_counts', 'cycle_count_items',
    'batch_lots', 'serial_numbers', 'consignment_stock', 'consignment_transactions',
    'work_centers', 'bom_headers', 'bom_lines', 'bom_operations',
    'production_orders', 'production_order_components', 'production_order_operations',
    'production_goods_receipts', 'capacity_schedules', 'mrp_runs', 'mrp_results',
    'cost_centers', 'internal_orders', 'co_documents', 'co_document_lines',
    'allocation_rules', 'allocation_rule_targets', 'allocation_runs',
    'prepaid_expenses', 'amortization_schedule', 'projects', 'fixed_assets',
    'asset_depreciation', 'budgets', 'budget_lines', 'cash_flow_forecasts',
    'payroll_periods', 'payroll_runs', 'payroll_items', 'payslips', 'deduction_types',
    'expense_claims', 'cash_flow_predictions', 'revenue_predictions',
    'subscriptions', 'subscription_invoices', 'revenue_recognition_schedules',
    'intercompany_transactions', 'consolidation_runs', 'consolidation_entries',
    'shipment_lines', 'stock_transfer_lines', 'cycle_count_lines', 'tax_filing_periods',
    'employee_deductions', 'payroll_item_deductions', 'investor_metrics_snapshots',
    'sales_targets', 'close_tasks', 'opportunities', 'service_calls',
    'service_contracts', 'field_service_visits', 'warranties',
    'agent_runs', 'agent_run_steps', 'ai_audit_logs', 'chat_messages',
    'decision_traces', 'decision_entities', 'precedent_references',
    'decision_overrides', 'confidence_adjustments', 'decision_desk_tabs',
    'scheduled_reports', 'integrations', 'integration_sync_logs',
    'departments', 'positions', 'employees', 'attendance_records',
    'employee_documents', 'employee_emergency_contacts', 'time_off_balances',
    'time_off_requests', 'time_off_types'
  ] LOOP
    IF to_regclass(format('public.%I', target_table)) IS NOT NULL THEN
      EXECUTE format('LOCK TABLE public.%I IN SHARE ROW EXCLUSIVE MODE', target_table);
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  target_table text;
  trigger_record record;
  policy_record record;
  column_record record;
  role_name text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'quotations', 'quotation_lines', 'sales_orders', 'sales_order_lines',
    'shipments', 'shipment_items', 'purchase_requisitions', 'purchase_requisition_lines',
    'purchase_orders', 'purchase_order_lines', 'goods_receipts', 'goods_receipt_lines',
    'tax_jurisdictions', 'tax_codes', 'tax_rates', 'tax_transactions', 'tax_filings',
    'exchange_rates', 'currency_revaluations',
    'warehouses', 'bin_locations', 'products', 'inventory_stock', 'inventory_transactions',
    'inventory_movements', 'inventory_receipts', 'inventory_receipt_lines',
    'stock_transfers', 'stock_transfer_items', 'cycle_counts', 'cycle_count_items',
    'batch_lots', 'serial_numbers', 'consignment_stock', 'consignment_transactions',
    'work_centers', 'bom_headers', 'bom_lines', 'bom_operations',
    'production_orders', 'production_order_components', 'production_order_operations',
    'production_goods_receipts', 'capacity_schedules', 'mrp_runs', 'mrp_results',
    'cost_centers', 'internal_orders', 'co_documents', 'co_document_lines',
    'allocation_rules', 'allocation_rule_targets', 'allocation_runs',
    'prepaid_expenses', 'amortization_schedule', 'projects', 'fixed_assets',
    'asset_depreciation', 'budgets', 'budget_lines', 'cash_flow_forecasts',
    'payroll_periods', 'payroll_runs', 'payroll_items', 'payslips', 'deduction_types',
    'expense_claims', 'cash_flow_predictions', 'revenue_predictions',
    'subscriptions', 'subscription_invoices', 'revenue_recognition_schedules',
    'intercompany_transactions', 'consolidation_runs', 'consolidation_entries',
    'shipment_lines', 'stock_transfer_lines', 'cycle_count_lines', 'tax_filing_periods',
    'employee_deductions', 'payroll_item_deductions', 'investor_metrics_snapshots',
    'sales_targets', 'close_tasks', 'opportunities', 'service_calls',
    'service_contracts', 'field_service_visits', 'warranties',
    'agent_runs', 'agent_run_steps', 'ai_audit_logs', 'chat_messages',
    'decision_traces', 'decision_entities', 'precedent_references',
    'decision_overrides', 'confidence_adjustments', 'decision_desk_tabs',
    'scheduled_reports', 'integrations', 'integration_sync_logs',
    'departments', 'positions', 'employees', 'attendance_records',
    'employee_documents', 'employee_emergency_contacts', 'time_off_balances',
    'time_off_requests', 'time_off_types'
  ] LOOP
    IF to_regclass(format('public.%I', target_table)) IS NULL THEN CONTINUE; END IF;

    FOR trigger_record IN
      SELECT trigger.tgname
      FROM pg_trigger trigger
      JOIN pg_class relation ON relation.oid = trigger.tgrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = target_table
        AND NOT trigger.tgisinternal
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_record.tgname, target_table);
    END LOOP;

    EXECUTE format(
      'CREATE TRIGGER guard_residual_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.guard_residual_financial_history()', target_table
    );
    EXECUTE format(
      'CREATE TRIGGER guard_residual_truncate BEFORE TRUNCATE ON public.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION public.guard_residual_financial_history()', target_table
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', target_table);

    FOR policy_record IN
      SELECT policyname FROM pg_policies AS policy_info
      WHERE policy_info.schemaname = 'public' AND policy_info.tablename = target_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, target_table);
    END LOOP;

    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', target_table);
    FOR column_record IN
      SELECT column_info.column_name FROM information_schema.columns AS column_info
      WHERE column_info.table_schema = 'public' AND column_info.table_name = target_table
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC',
        column_record.column_name, target_table);
      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM %I',
          column_record.column_name, target_table, role_name);
      END LOOP;
    END LOOP;

    IF EXISTS (
      SELECT 1 FROM pg_publication_tables AS publication_info
      WHERE publication_info.pubname = 'supabase_realtime'
        AND publication_info.schemaname = 'public'
        AND publication_info.tablename = target_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', target_table);
    END IF;
  END LOOP;
END;
$$;

DO $$
DECLARE
  function_record record;
BEGIN
  FOR function_record IN
    SELECT oid::regprocedure AS signature
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN (
        'backflush_production_components', 'calculate_tax', 'convert_currency',
        'find_similar_precedents', 'get_current_tax_rate', 'get_exchange_rate',
        'get_org_openai_key', 'post_production_goods_receipt',
        'search_precedents_by_text', 'update_inventory_on_goods_receipt',
        'update_inventory_on_receipt_post', 'update_inventory_on_shipment'
      )
  LOOP
    EXECUTE format('DROP FUNCTION %s', function_record.signature);
  END LOOP;
END;
$$;

COMMIT;
