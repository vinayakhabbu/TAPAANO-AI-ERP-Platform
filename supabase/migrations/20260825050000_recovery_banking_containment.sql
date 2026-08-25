-- Recovery containment: bank, feed, import, match and positive-pay records are
-- frozen preservation evidence. Authenticated clients receive only non-secret,
-- non-balance account/transaction metadata. No reconciliation is implemented.

BEGIN;

LOCK TABLE public.entities, public.accounts, public.bank_accounts,
  public.bank_transactions, public.matching_rules, public.bank_statement_imports,
  public.positive_pay_checks, public.bank_feed_connections, public.bank_connections,
  public.invoices, public.bills, public.payment_runs, public.journal_entries
  IN SHARE ROW EXCLUSIVE MODE;

CREATE UNIQUE INDEX IF NOT EXISTS entities_org_id_id_banking_uidx ON public.entities (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_org_id_id_banking_uidx ON public.accounts (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_org_id_id_banking_uidx ON public.bank_accounts (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_id_id_banking_uidx ON public.invoices (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS bills_org_id_id_banking_uidx ON public.bills (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_runs_org_id_id_banking_uidx ON public.payment_runs (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS matching_rules_org_id_id_banking_uidx ON public.matching_rules (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS bank_imports_org_id_id_banking_uidx ON public.bank_statement_imports (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_org_id_id_banking_uidx ON public.journal_entries (org_id, id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.bank_accounts bank
    LEFT JOIN public.entities entity ON entity.id = bank.entity_id
    LEFT JOIN public.accounts account ON account.id = bank.account_id
    WHERE entity.id IS NULL OR entity.org_id IS DISTINCT FROM bank.org_id
       OR (bank.account_id IS NOT NULL AND (account.id IS NULL OR account.org_id IS DISTINCT FROM bank.org_id))
       OR bank.current_balance::text IN ('NaN', 'Infinity', '-Infinity')
  ) THEN
    RAISE EXCEPTION 'banking containment preflight: invalid account lineage or balance';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bank_transactions transaction
    LEFT JOIN public.bank_accounts bank ON bank.id = transaction.bank_account_id
    LEFT JOIN public.invoices invoice ON invoice.id = transaction.matched_invoice_id
    LEFT JOIN public.bills bill ON bill.id = transaction.matched_bill_id
    LEFT JOIN public.accounts suggested ON suggested.id = transaction.suggested_account_id
    LEFT JOIN public.matching_rules rule ON rule.id = transaction.matched_rule_id
    LEFT JOIN public.bank_statement_imports import ON import.id = transaction.import_id
    LEFT JOIN public.journal_entries journal ON journal.id = transaction.journal_entry_id
    WHERE bank.id IS NULL OR bank.org_id IS DISTINCT FROM transaction.org_id
       OR transaction.transaction_date IS NULL
       OR transaction.amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR (transaction.matched_invoice_id IS NOT NULL AND (invoice.id IS NULL OR invoice.org_id IS DISTINCT FROM transaction.org_id))
       OR (transaction.matched_bill_id IS NOT NULL AND (bill.id IS NULL OR bill.org_id IS DISTINCT FROM transaction.org_id))
       OR (transaction.suggested_account_id IS NOT NULL AND (suggested.id IS NULL OR suggested.org_id IS DISTINCT FROM transaction.org_id))
       OR (transaction.matched_rule_id IS NOT NULL AND (rule.id IS NULL OR rule.org_id IS DISTINCT FROM transaction.org_id))
       OR (transaction.import_id IS NOT NULL AND (import.id IS NULL OR import.org_id IS DISTINCT FROM transaction.org_id))
       OR (transaction.journal_entry_id IS NOT NULL AND (journal.id IS NULL OR journal.org_id IS DISTINCT FROM transaction.org_id))
  ) THEN
    RAISE EXCEPTION 'banking containment preflight: invalid transaction lineage or amount';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT org_id, bank_account_id FROM public.bank_statement_imports
      UNION ALL SELECT org_id, bank_account_id FROM public.bank_feed_connections
      UNION ALL SELECT org_id, bank_account_id FROM public.positive_pay_checks
      UNION ALL SELECT org_id, bank_account_id FROM public.bank_connections WHERE bank_account_id IS NOT NULL
    ) child
    LEFT JOIN public.bank_accounts bank ON bank.id = child.bank_account_id
    WHERE bank.id IS NULL OR bank.org_id IS DISTINCT FROM child.org_id
  ) THEN
    RAISE EXCEPTION 'banking containment preflight: cross-tenant bank child';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.positive_pay_checks check_row
    LEFT JOIN public.bills bill ON bill.id = check_row.bill_id
    LEFT JOIN public.payment_runs run ON run.id = check_row.payment_run_id
    WHERE check_row.amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR check_row.amount <= 0
       OR check_row.presented_amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR (check_row.presented_amount IS NOT NULL AND check_row.presented_amount < 0)
       OR (check_row.bill_id IS NOT NULL AND (bill.id IS NULL OR bill.org_id IS DISTINCT FROM check_row.org_id))
       OR (check_row.payment_run_id IS NOT NULL AND (run.id IS NULL OR run.org_id IS DISTINCT FROM check_row.org_id))
  ) THEN
    RAISE EXCEPTION 'banking containment preflight: invalid positive-pay lineage or amount';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_accounts_org_entity_recovery_fkey') THEN
    ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_org_entity_recovery_fkey
      FOREIGN KEY (org_id, entity_id) REFERENCES public.entities(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_accounts_org_gl_recovery_fkey') THEN
    ALTER TABLE public.bank_accounts ADD CONSTRAINT bank_accounts_org_gl_recovery_fkey
      FOREIGN KEY (org_id, account_id) REFERENCES public.accounts(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_org_bank_recovery_fkey') THEN
    ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_org_bank_recovery_fkey
      FOREIGN KEY (org_id, bank_account_id) REFERENCES public.bank_accounts(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_org_invoice_recovery_fkey') THEN
    ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_org_invoice_recovery_fkey
      FOREIGN KEY (org_id, matched_invoice_id) REFERENCES public.invoices(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_org_bill_recovery_fkey') THEN
    ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_org_bill_recovery_fkey
      FOREIGN KEY (org_id, matched_bill_id) REFERENCES public.bills(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_org_account_recovery_fkey') THEN
    ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_org_account_recovery_fkey
      FOREIGN KEY (org_id, suggested_account_id) REFERENCES public.accounts(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_org_rule_recovery_fkey') THEN
    ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_org_rule_recovery_fkey
      FOREIGN KEY (org_id, matched_rule_id) REFERENCES public.matching_rules(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_org_import_recovery_fkey') THEN
    ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_org_import_recovery_fkey
      FOREIGN KEY (org_id, import_id) REFERENCES public.bank_statement_imports(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_transactions_org_journal_recovery_fkey') THEN
    ALTER TABLE public.bank_transactions ADD CONSTRAINT bank_transactions_org_journal_recovery_fkey
      FOREIGN KEY (org_id, journal_entry_id) REFERENCES public.journal_entries(org_id, id);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_frozen_banking_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'legacy banking history is immutable; reconciliation is unavailable';
END;
$$;

DO $$
DECLARE
  table_name text;
  policy_record record;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'bank_accounts', 'bank_transactions', 'matching_rules',
    'bank_statement_imports', 'positive_pay_checks',
    'bank_feed_connections', 'bank_connections'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guard_%I_write ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER guard_%I_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.guard_frozen_banking_history()', table_name, table_name
    );
    EXECUTE format('DROP TRIGGER IF EXISTS guard_%I_truncate ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER guard_%I_truncate BEFORE TRUNCATE ON public.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION public.guard_frozen_banking_history()', table_name, table_name
    );
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
  END LOOP;

  FOR policy_record IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN (
      'bank_accounts', 'bank_transactions', 'matching_rules',
      'bank_statement_imports', 'positive_pay_checks',
      'bank_feed_connections', 'bank_connections'
    )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, policy_record.tablename);
  END LOOP;
END;
$$;

CREATE POLICY bank_accounts_tenant_metadata_read ON public.bank_accounts
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
CREATE POLICY bank_transactions_tenant_metadata_read ON public.bank_transactions
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());

REVOKE ALL ON TABLE public.bank_accounts, public.bank_transactions,
  public.matching_rules, public.bank_statement_imports, public.positive_pay_checks,
  public.bank_feed_connections, public.bank_connections
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  column_record record;
  role_name text;
BEGIN
  FOR column_record IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name IN (
      'bank_accounts', 'bank_transactions', 'matching_rules',
      'bank_statement_imports', 'positive_pay_checks',
      'bank_feed_connections', 'bank_connections'
    )
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC',
      column_record.column_name, column_record.table_name);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM %I',
        column_record.column_name, column_record.table_name, role_name);
    END LOOP;
  END LOOP;
END;
$$;

GRANT SELECT (id, org_id, entity_id, name, bank_name, currency, is_active, created_at, updated_at)
  ON TABLE public.bank_accounts TO authenticated;
GRANT SELECT (id, org_id, bank_account_id, transaction_date, description, created_at, updated_at)
  ON TABLE public.bank_transactions TO authenticated;

DO $$
DECLARE
  function_record record;
  table_name text;
BEGIN
  FOR function_record IN
    SELECT oid::regprocedure AS signature FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace AND proname = 'apply_matching_rules'
  LOOP
    EXECUTE format('DROP FUNCTION %s', function_record.signature);
  END LOOP;

  FOREACH table_name IN ARRAY ARRAY[
    'bank_accounts', 'bank_transactions', 'matching_rules',
    'bank_statement_imports', 'positive_pay_checks',
    'bank_feed_connections', 'bank_connections'
  ] LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
