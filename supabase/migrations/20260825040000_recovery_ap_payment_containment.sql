-- Recovery containment: legacy AP bill/payment history is read-only and
-- explicitly non-authoritative until an atomic bill-to-payment-to-GL workflow
-- exists. No existing financial row is rewritten or promoted by this migration.

BEGIN;

LOCK TABLE public.organizations, public.entities, public.vendors, public.bills,
  public.bank_accounts, public.payment_runs, public.payment_run_items
  IN SHARE ROW EXCLUSIVE MODE;

CREATE UNIQUE INDEX IF NOT EXISTS entities_org_id_id_ap_uidx
  ON public.entities (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS vendors_org_id_id_ap_uidx
  ON public.vendors (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS bills_org_id_entity_id_id_ap_uidx
  ON public.bills (org_id, entity_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS bank_accounts_org_id_entity_id_id_ap_uidx
  ON public.bank_accounts (org_id, entity_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS payment_runs_org_id_entity_id_id_ap_uidx
  ON public.payment_runs (org_id, entity_id, id);

ALTER TABLE public.payment_run_items
  ADD COLUMN IF NOT EXISTS org_id uuid,
  ADD COLUMN IF NOT EXISTS entity_id uuid;

UPDATE public.payment_run_items item
SET org_id = run.org_id, entity_id = run.entity_id
FROM public.payment_runs run
WHERE run.id = item.payment_run_id
  AND (item.org_id IS NULL OR item.entity_id IS NULL);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.bills bill
    LEFT JOIN public.entities entity ON entity.id = bill.entity_id
    LEFT JOIN public.vendors vendor ON vendor.id = bill.vendor_id
    WHERE entity.id IS NULL OR vendor.id IS NULL
       OR entity.org_id IS DISTINCT FROM bill.org_id
       OR vendor.org_id IS DISTINCT FROM bill.org_id
  ) THEN
    RAISE EXCEPTION 'AP containment preflight: dangling or cross-tenant bill lineage';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.bills
    WHERE issue_date IS NULL OR due_date IS NULL OR due_date < issue_date
       OR subtotal::text IN ('NaN', 'Infinity', '-Infinity')
       OR tax::text IN ('NaN', 'Infinity', '-Infinity')
       OR total::text IN ('NaN', 'Infinity', '-Infinity')
       OR amount_paid::text IN ('NaN', 'Infinity', '-Infinity')
       OR subtotal < 0 OR tax < 0 OR total < 0
       OR amount_paid < 0 OR amount_paid > total
       OR round(subtotal + tax, 2) IS DISTINCT FROM total
  ) THEN
    RAISE EXCEPTION 'AP containment preflight: invalid bill values';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payment_runs run
    LEFT JOIN public.entities entity ON entity.id = run.entity_id
    LEFT JOIN public.bank_accounts bank
      ON bank.id = run.bank_account_id
    WHERE entity.id IS NULL
       OR entity.org_id IS DISTINCT FROM run.org_id
       OR (run.bank_account_id IS NOT NULL AND (
         bank.id IS NULL OR bank.org_id IS DISTINCT FROM run.org_id
         OR bank.entity_id IS DISTINCT FROM run.entity_id
       ))
       OR run.run_date IS NULL
       OR run.total_amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR run.total_amount < 0
  ) THEN
    RAISE EXCEPTION 'AP containment preflight: invalid payment-run lineage or value';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payment_run_items item
    LEFT JOIN public.payment_runs run ON run.id = item.payment_run_id
    LEFT JOIN public.bills bill ON bill.id = item.bill_id
    WHERE run.id IS NULL OR bill.id IS NULL
       OR item.org_id IS NULL OR item.entity_id IS NULL
       OR item.org_id IS DISTINCT FROM run.org_id
       OR item.entity_id IS DISTINCT FROM run.entity_id
       OR bill.org_id IS DISTINCT FROM run.org_id
       OR bill.entity_id IS DISTINCT FROM run.entity_id
       OR item.amount::text IN ('NaN', 'Infinity', '-Infinity')
       OR item.amount <= 0 OR item.amount > bill.total
  ) THEN
    RAISE EXCEPTION 'AP containment preflight: invalid payment item lineage or value';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.payment_runs run
    LEFT JOIN (
      SELECT payment_run_id, sum(amount) AS item_total
      FROM public.payment_run_items GROUP BY payment_run_id
    ) totals ON totals.payment_run_id = run.id
    WHERE COALESCE(totals.item_total, 0) IS DISTINCT FROM run.total_amount
  ) THEN
    RAISE EXCEPTION 'AP containment preflight: payment-run items do not reconcile';
  END IF;
END;
$$;

ALTER TABLE public.payment_run_items
  ALTER COLUMN org_id SET NOT NULL,
  ALTER COLUMN entity_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bills_org_entity_ap_fkey') THEN
    ALTER TABLE public.bills ADD CONSTRAINT bills_org_entity_ap_fkey
      FOREIGN KEY (org_id, entity_id) REFERENCES public.entities(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bills_org_vendor_ap_fkey') THEN
    ALTER TABLE public.bills ADD CONSTRAINT bills_org_vendor_ap_fkey
      FOREIGN KEY (org_id, vendor_id) REFERENCES public.vendors(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bills_value_ap_check') THEN
    ALTER TABLE public.bills ADD CONSTRAINT bills_value_ap_check CHECK (
      due_date >= issue_date
      AND subtotal::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND tax::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND total::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND amount_paid::text NOT IN ('NaN', 'Infinity', '-Infinity')
      AND subtotal >= 0 AND tax >= 0 AND total >= 0
      AND amount_paid >= 0 AND amount_paid <= total
      AND round(subtotal + tax, 2) = total
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_runs_org_entity_ap_fkey') THEN
    ALTER TABLE public.payment_runs ADD CONSTRAINT payment_runs_org_entity_ap_fkey
      FOREIGN KEY (org_id, entity_id) REFERENCES public.entities(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_runs_org_bank_ap_fkey') THEN
    ALTER TABLE public.payment_runs ADD CONSTRAINT payment_runs_org_bank_ap_fkey
      FOREIGN KEY (org_id, entity_id, bank_account_id)
      REFERENCES public.bank_accounts(org_id, entity_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_runs_value_ap_check') THEN
    ALTER TABLE public.payment_runs ADD CONSTRAINT payment_runs_value_ap_check CHECK (
      total_amount::text NOT IN ('NaN', 'Infinity', '-Infinity') AND total_amount >= 0
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_items_org_run_ap_fkey') THEN
    ALTER TABLE public.payment_run_items ADD CONSTRAINT payment_items_org_run_ap_fkey
      FOREIGN KEY (org_id, entity_id, payment_run_id)
      REFERENCES public.payment_runs(org_id, entity_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_items_org_bill_ap_fkey') THEN
    ALTER TABLE public.payment_run_items ADD CONSTRAINT payment_items_org_bill_ap_fkey
      FOREIGN KEY (org_id, entity_id, bill_id)
      REFERENCES public.bills(org_id, entity_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_items_value_ap_check') THEN
    ALTER TABLE public.payment_run_items ADD CONSTRAINT payment_items_value_ap_check CHECK (
      amount::text NOT IN ('NaN', 'Infinity', '-Infinity') AND amount > 0
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_frozen_ap_payment_history()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'legacy AP/payment history is immutable; controlled workflow unavailable';
END;
$$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['bills', 'payment_runs', 'payment_run_items']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guard_%I_write ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER guard_%I_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.guard_frozen_ap_payment_history()',
      table_name, table_name
    );
    EXECUTE format('DROP TRIGGER IF EXISTS guard_%I_truncate ON public.%I', table_name, table_name);
    EXECUTE format(
      'CREATE TRIGGER guard_%I_truncate BEFORE TRUNCATE ON public.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION public.guard_frozen_ap_payment_history()',
      table_name, table_name
    );
  END LOOP;
END;
$$;

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_run_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT tablename, policyname FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('bills', 'payment_runs', 'payment_run_items')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, policy_record.tablename);
  END LOOP;
END;
$$;

CREATE POLICY bills_tenant_history_read ON public.bills
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
CREATE POLICY payment_runs_tenant_history_read ON public.payment_runs
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
CREATE POLICY payment_items_tenant_history_read ON public.payment_run_items
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());

REVOKE ALL ON TABLE public.bills, public.payment_runs, public.payment_run_items
  FROM PUBLIC, anon, authenticated, service_role;

DO $$
DECLARE
  column_record record;
  role_name text;
BEGIN
  FOR column_record IN
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('bills', 'payment_runs', 'payment_run_items')
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC',
      column_record.column_name, column_record.table_name);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM %I',
        column_record.column_name, column_record.table_name, role_name);
    END LOOP;
  END LOOP;
END;
$$;

GRANT SELECT ON TABLE public.bills, public.payment_runs, public.payment_run_items
  TO authenticated, service_role;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['bills', 'payment_runs', 'payment_run_items']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', table_name);
    END IF;
  END LOOP;
END;
$$;

COMMIT;
