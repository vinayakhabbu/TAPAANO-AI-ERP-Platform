-- One controlled replacement after a verified customer-receipt correction.
-- PostgreSQL derives the immutable amount, currency, lineage, accounts, and
-- journal lines. This is an accounting record, not evidence of bank action.

BEGIN;

LOCK TABLE public.customer_receipts, public.customer_receipt_corrections,
  public.accounting_events, public.accounting_periods, public.journal_entries,
  public.journal_lines IN SHARE ROW EXCLUSIVE MODE;

CREATE UNIQUE INDEX IF NOT EXISTS customer_receipt_corrections_replacement_fkey_uidx
  ON public.customer_receipt_corrections
    (org_id, entity_id, customer_id, original_receipt_id, id);

CREATE TABLE IF NOT EXISTS public.customer_receipt_replacements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  original_receipt_id uuid NOT NULL,
  original_correction_id uuid NOT NULL,
  replacement_number text NOT NULL,
  replacement_date date NOT NULL,
  currency text NOT NULL,
  amount numeric(15,2) NOT NULL,
  reference text NOT NULL,
  accounting_event_id uuid NOT NULL REFERENCES public.accounting_events(id),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id),
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  posted_by uuid NOT NULL REFERENCES auth.users(id),
  posted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_receipt_replacements_number_check CHECK (
    replacement_number = btrim(replacement_number)
    AND length(replacement_number) BETWEEN 1 AND 80
    AND replacement_number !~ '[[:cntrl:]]'
  ),
  CONSTRAINT customer_receipt_replacements_reference_check CHECK (
    reference = btrim(reference)
    AND length(reference) BETWEEN 1 AND 240
    AND reference !~ '[[:cntrl:]]'
  ),
  CONSTRAINT customer_receipt_replacements_currency_check
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT customer_receipt_replacements_amount_check CHECK (
    amount::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND amount > 0 AND round(amount, 2) = amount
  ),
  CONSTRAINT customer_receipt_replacements_key_check CHECK (
    idempotency_key = btrim(idempotency_key)
    AND length(idempotency_key) BETWEEN 1 AND 160
    AND idempotency_key !~ '[[:cntrl:]]'
    AND payload_hash ~ '^[0-9a-f]{32}$'
  ),
  CONSTRAINT customer_receipt_replacements_correction_fkey
    FOREIGN KEY (
      org_id, entity_id, customer_id, original_receipt_id,
      original_correction_id
    ) REFERENCES public.customer_receipt_corrections(
      org_id, entity_id, customer_id, original_receipt_id, id
    ),
  UNIQUE (org_id, replacement_number),
  UNIQUE (org_id, idempotency_key),
  UNIQUE (original_correction_id),
  UNIQUE (accounting_event_id),
  UNIQUE (journal_entry_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_receipt_replacements_org_entity_id_uidx
  ON public.customer_receipt_replacements (org_id, entity_id, id);

LOCK TABLE public.customer_receipt_replacements IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.accounting_events
  DROP CONSTRAINT IF EXISTS accounting_events_type_check;
ALTER TABLE public.accounting_events
  ADD CONSTRAINT accounting_events_type_check CHECK (
    event_type IN (
      'manual_journal_posted', 'journal_reversed', 'customer_invoice_posted',
      'customer_credit_note_posted', 'customer_receipt_posted',
      'supplier_bill_posted', 'supplier_bill_credit_posted',
      'supplier_payment_posted', 'customer_receipt_corrected',
      'supplier_payment_corrected', 'customer_receipt_replaced'
    )
  );
ALTER TABLE public.accounting_events
  DROP CONSTRAINT IF EXISTS accounting_events_source_type_check;
ALTER TABLE public.accounting_events
  ADD CONSTRAINT accounting_events_source_type_check CHECK (
    source_type IN (
      'manual_journal', 'journal_reversal', 'customer_invoice',
      'customer_credit_note', 'customer_receipt', 'supplier_bill',
      'supplier_bill_credit', 'supplier_payment',
      'customer_receipt_correction', 'supplier_payment_correction',
      'customer_receipt_replacement'
    )
  );
ALTER TABLE public.accounting_events
  DROP CONSTRAINT IF EXISTS accounting_events_source_shape_check;
ALTER TABLE public.accounting_events
  ADD CONSTRAINT accounting_events_source_shape_check CHECK (
    (source_type = 'manual_journal' AND source_id IS NULL)
    OR (source_type IN (
      'journal_reversal', 'customer_invoice', 'customer_credit_note',
      'customer_receipt', 'supplier_bill', 'supplier_bill_credit',
      'supplier_payment', 'customer_receipt_correction',
      'supplier_payment_correction', 'customer_receipt_replacement'
    ) AND source_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.guard_customer_receipt_replacement_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('tapaano.customer_receipt_replacement_write', true)
       IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'customer receipt replacement is immutable; use the trusted replacement workflow';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_settlement_replacement_graph()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_source_type text;
  v_journal_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'accounting_events' THEN
    IF OLD.source_type = 'customer_receipt_replacement'
       AND current_setting('tapaano.customer_receipt_replacement_write', true)
         IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'customer receipt replacement accounting event is immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'journal_entries' THEN
    IF TG_OP = 'INSERT' AND NEW.reversal_of_id IS NOT NULL THEN
      SELECT event.source_type INTO v_source_type
      FROM public.journal_entries original
      LEFT JOIN public.accounting_events event
        ON event.id = original.accounting_event_id
      WHERE original.id = NEW.reversal_of_id;
      IF v_source_type = 'customer_receipt_replacement' THEN
        RAISE EXCEPTION 'customer receipt replacement reversal is unavailable';
      END IF;
    ELSIF TG_OP IN ('UPDATE', 'DELETE') THEN
      SELECT source_type INTO v_source_type FROM public.accounting_events
      WHERE id = OLD.accounting_event_id;
      IF v_source_type = 'customer_receipt_replacement'
         AND current_setting('tapaano.customer_receipt_replacement_write', true)
           IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'customer receipt replacement journal is immutable';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME = 'journal_lines' THEN
    IF TG_OP = 'TRUNCATE' THEN
      IF current_setting('tapaano.customer_receipt_replacement_write', true)
           IS DISTINCT FROM 'trusted'
         AND EXISTS (SELECT 1 FROM public.accounting_events
           WHERE source_type = 'customer_receipt_replacement') THEN
        RAISE EXCEPTION 'customer receipt replacement journal lines are immutable';
      END IF;
      RETURN NULL;
    END IF;
    v_journal_id := CASE WHEN TG_OP = 'DELETE'
      THEN OLD.journal_entry_id ELSE NEW.journal_entry_id END;
    SELECT event.source_type INTO v_source_type
    FROM public.journal_entries journal
    LEFT JOIN public.accounting_events event
      ON event.id = journal.accounting_event_id
    WHERE journal.id = v_journal_id;
    IF v_source_type = 'customer_receipt_replacement'
       AND current_setting('tapaano.customer_receipt_replacement_write', true)
         IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'customer receipt replacement journal lines are immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_customer_receipt_replacement_graph(
  p_replacement_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_replacement public.customer_receipt_replacements%ROWTYPE;
  v_correction public.customer_receipt_corrections%ROWTYPE;
  v_receipt public.customer_receipts%ROWTYPE;
  v_event public.accounting_events%ROWTYPE;
  v_journal public.journal_entries%ROWTYPE;
  v_original_journal public.journal_entries%ROWTYPE;
  v_period public.accounting_periods%ROWTYPE;
  v_line_count integer;
  v_debit numeric;
  v_credit numeric;
BEGIN
  SELECT * INTO v_replacement FROM public.customer_receipt_replacements
  WHERE id = p_replacement_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_replacement.replacement_number IS NULL
     OR v_replacement.replacement_number
       IS DISTINCT FROM btrim(v_replacement.replacement_number)
     OR length(v_replacement.replacement_number) NOT BETWEEN 1 AND 80
     OR v_replacement.replacement_number ~ '[[:cntrl:]]'
     OR v_replacement.replacement_date IS NULL
     OR v_replacement.currency !~ '^[A-Z]{3}$'
     OR v_replacement.amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_replacement.amount <= 0
     OR round(v_replacement.amount, 2) IS DISTINCT FROM v_replacement.amount
     OR v_replacement.reference IS NULL
     OR v_replacement.reference IS DISTINCT FROM btrim(v_replacement.reference)
     OR length(v_replacement.reference) NOT BETWEEN 1 AND 240
     OR v_replacement.reference ~ '[[:cntrl:]]'
     OR v_replacement.accounting_event_id IS NULL
     OR v_replacement.journal_entry_id IS NULL
     OR v_replacement.posted_by IS NULL
     OR v_replacement.posted_at IS NULL THEN
    RAISE EXCEPTION 'customer receipt replacement header is not canonical';
  END IF;
  SELECT * INTO v_correction FROM public.customer_receipt_corrections
  WHERE id = v_replacement.original_correction_id;
  IF NOT FOUND OR v_correction.org_id IS DISTINCT FROM v_replacement.org_id
     OR v_correction.entity_id IS DISTINCT FROM v_replacement.entity_id
     OR v_correction.customer_id IS DISTINCT FROM v_replacement.customer_id
     OR v_correction.original_receipt_id
       IS DISTINCT FROM v_replacement.original_receipt_id
     OR v_correction.currency IS DISTINCT FROM v_replacement.currency
     OR v_correction.amount IS DISTINCT FROM v_replacement.amount
     OR v_replacement.replacement_date < v_correction.correction_date THEN
    RAISE EXCEPTION 'customer receipt replacement correction graph is invalid';
  END IF;
  PERFORM public.validate_customer_receipt_correction_graph(v_correction.id);
  SELECT * INTO v_receipt FROM public.customer_receipts
  WHERE id = v_replacement.original_receipt_id;
  IF NOT FOUND OR v_receipt.org_id IS DISTINCT FROM v_replacement.org_id
     OR v_receipt.entity_id IS DISTINCT FROM v_replacement.entity_id
     OR v_receipt.customer_id IS DISTINCT FROM v_replacement.customer_id
     OR v_receipt.invoice_id IS DISTINCT FROM v_replacement.invoice_id
     OR v_receipt.currency IS DISTINCT FROM v_replacement.currency
     OR v_receipt.amount IS DISTINCT FROM v_replacement.amount THEN
    RAISE EXCEPTION 'customer receipt replacement source graph is invalid';
  END IF;
  SELECT * INTO v_event FROM public.accounting_events
  WHERE id = v_replacement.accounting_event_id;
  IF NOT FOUND OR v_event.org_id IS DISTINCT FROM v_replacement.org_id
     OR v_event.entity_id IS DISTINCT FROM v_replacement.entity_id
     OR v_event.event_type IS DISTINCT FROM 'customer_receipt_replaced'
     OR v_event.source_type IS DISTINCT FROM 'customer_receipt_replacement'
     OR v_event.source_id IS DISTINCT FROM v_replacement.id
     OR v_event.journal_entry_id IS DISTINCT FROM v_replacement.journal_entry_id
     OR v_event.idempotency_key IS DISTINCT FROM v_replacement.idempotency_key
     OR v_event.payload_hash IS DISTINCT FROM v_replacement.payload_hash
     OR v_event.actor_id IS DISTINCT FROM v_replacement.posted_by THEN
    RAISE EXCEPTION 'customer receipt replacement event graph is invalid';
  END IF;
  SELECT * INTO v_journal FROM public.journal_entries
  WHERE id = v_replacement.journal_entry_id;
  SELECT * INTO v_original_journal FROM public.journal_entries
  WHERE id = v_receipt.journal_entry_id;
  IF v_journal.id IS NULL OR v_original_journal.id IS NULL
     OR v_journal.org_id IS DISTINCT FROM v_replacement.org_id
     OR v_journal.entity_id IS DISTINCT FROM v_replacement.entity_id
     OR v_journal.status::text IS DISTINCT FROM 'posted'
     OR v_journal.source_module IS DISTINCT FROM 'ar_receipt_replacement'
     OR v_journal.entry_date IS DISTINCT FROM v_replacement.replacement_date
     OR v_journal.accounting_event_id IS DISTINCT FROM v_replacement.accounting_event_id
     OR v_journal.created_by IS DISTINCT FROM v_replacement.posted_by
     OR v_journal.accounting_period_id IS NULL
     OR v_journal.reversal_of_id IS NOT NULL
     OR v_journal.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'customer receipt replacement journal graph is invalid';
  END IF;
  SELECT * INTO v_period FROM public.accounting_periods
  WHERE id = v_journal.accounting_period_id;
  IF v_period.id IS NULL OR v_period.org_id IS DISTINCT FROM v_replacement.org_id
     OR v_period.entity_id IS DISTINCT FROM v_replacement.entity_id
     OR v_replacement.replacement_date
       NOT BETWEEN v_period.period_start AND v_period.period_end THEN
    RAISE EXCEPTION 'customer receipt replacement period graph is invalid';
  END IF;
  SELECT count(*), COALESCE(sum(debit), 0), COALESCE(sum(credit), 0)
  INTO v_line_count, v_debit, v_credit
  FROM public.journal_lines WHERE journal_entry_id = v_journal.id;
  IF v_line_count IS DISTINCT FROM 2
     OR v_debit IS DISTINCT FROM v_replacement.amount
     OR v_credit IS DISTINCT FROM v_replacement.amount
     OR EXISTS (
       SELECT 1 FROM public.journal_lines original_line
       LEFT JOIN public.journal_lines replacement_line
         ON replacement_line.journal_entry_id = v_journal.id
        AND replacement_line.line_number = original_line.line_number
       WHERE original_line.journal_entry_id = v_original_journal.id
         AND (replacement_line.id IS NULL
           OR replacement_line.account_id IS DISTINCT FROM original_line.account_id
           OR replacement_line.debit IS DISTINCT FROM original_line.debit
           OR replacement_line.credit IS DISTINCT FROM original_line.credit)
     ) THEN
    RAISE EXCEPTION 'customer receipt replacement journal lines are not an exact copy';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_customer_receipt_replacement_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_replacement_id uuid;
BEGIN
  v_replacement_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  PERFORM public.validate_customer_receipt_replacement_graph(v_replacement_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS guard_customer_receipt_replacement_write
  ON public.customer_receipt_replacements;
CREATE TRIGGER guard_customer_receipt_replacement_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.customer_receipt_replacements
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_receipt_replacement_write();
DROP TRIGGER IF EXISTS guard_customer_receipt_replacement_truncate
  ON public.customer_receipt_replacements;
CREATE TRIGGER guard_customer_receipt_replacement_truncate
  BEFORE TRUNCATE ON public.customer_receipt_replacements
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_customer_receipt_replacement_write();
DROP TRIGGER IF EXISTS validate_customer_receipt_replacement_deferred
  ON public.customer_receipt_replacements;
CREATE CONSTRAINT TRIGGER validate_customer_receipt_replacement_deferred
  AFTER INSERT OR UPDATE OR DELETE ON public.customer_receipt_replacements
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_customer_receipt_replacement_trigger();

DROP TRIGGER IF EXISTS guard_settlement_replacement_events
  ON public.accounting_events;
CREATE TRIGGER guard_settlement_replacement_events
  BEFORE UPDATE OR DELETE ON public.accounting_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_settlement_replacement_graph();
DROP TRIGGER IF EXISTS guard_settlement_replacement_journals
  ON public.journal_entries;
CREATE TRIGGER guard_settlement_replacement_journals
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_settlement_replacement_graph();
DROP TRIGGER IF EXISTS guard_settlement_replacement_lines
  ON public.journal_lines;
CREATE TRIGGER guard_settlement_replacement_lines
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_settlement_replacement_graph();
DROP TRIGGER IF EXISTS guard_settlement_replacement_lines_truncate
  ON public.journal_lines;
CREATE TRIGGER guard_settlement_replacement_lines_truncate
  BEFORE TRUNCATE ON public.journal_lines
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_settlement_replacement_graph();

CREATE OR REPLACE FUNCTION public.post_customer_receipt_replacement(
  p_correction_id uuid,
  p_replacement_number text,
  p_replacement_date date,
  p_reference text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_actor_org uuid;
  v_actor uuid;
  v_correction public.customer_receipt_corrections%ROWTYPE;
  v_receipt public.customer_receipts%ROWTYPE;
  v_original_journal public.journal_entries%ROWTYPE;
  v_period_id uuid;
  v_replacement_id uuid := gen_random_uuid();
  v_event_id uuid;
  v_journal_id uuid;
  v_existing_id uuid;
  v_existing_correction_id uuid;
  v_existing_hash text;
  v_payload_hash text;
BEGIN
  v_actor_org := public.get_user_org_id();
  IF v_actor_org IS NULL THEN
    RAISE EXCEPTION 'accounting actor identity is unavailable';
  END IF;
  v_actor := public.assert_accounting_actor(v_actor_org);
  IF p_replacement_number IS NULL
     OR p_replacement_number IS DISTINCT FROM btrim(p_replacement_number)
     OR length(p_replacement_number) NOT BETWEEN 1 AND 80
     OR p_replacement_number ~ '[[:cntrl:]]'
     OR p_replacement_date IS NULL
     OR p_reference IS NULL OR p_reference IS DISTINCT FROM btrim(p_reference)
     OR length(p_reference) NOT BETWEEN 1 AND 240
     OR p_reference ~ '[[:cntrl:]]'
     OR p_idempotency_key IS NULL
     OR p_idempotency_key IS DISTINCT FROM btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 160
     OR p_idempotency_key ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid customer receipt replacement request';
  END IF;
  v_payload_hash := md5(jsonb_build_object(
    'correction_id', p_correction_id,
    'replacement_number', p_replacement_number,
    'replacement_date', p_replacement_date,
    'reference', p_reference
  )::text);
  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.accounting_events IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.customer_receipts IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.customer_receipt_corrections IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.customer_receipt_replacements IN SHARE ROW EXCLUSIVE MODE;
  SELECT id, original_correction_id, payload_hash
  INTO v_existing_id, v_existing_correction_id, v_existing_hash
  FROM public.customer_receipt_replacements
  WHERE org_id = v_actor_org AND idempotency_key = p_idempotency_key;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_correction_id IS DISTINCT FROM p_correction_id
       OR v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'customer receipt replacement idempotency key conflicts with another payload';
    END IF;
    PERFORM public.validate_customer_receipt_replacement_graph(v_existing_id);
    RETURN v_existing_id;
  END IF;
  SELECT * INTO v_correction FROM public.customer_receipt_corrections
  WHERE id = p_correction_id AND org_id = v_actor_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'corrected customer receipt not found or unavailable';
  END IF;
  PERFORM public.validate_customer_receipt_correction_graph(v_correction.id);
  SELECT * INTO v_receipt FROM public.customer_receipts
  WHERE id = v_correction.original_receipt_id AND org_id = v_actor_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'corrected customer receipt not found or unavailable';
  END IF;
  SELECT * INTO v_original_journal FROM public.journal_entries
  WHERE id = v_receipt.journal_entry_id AND org_id = v_actor_org FOR UPDATE;
  IF v_original_journal.id IS NULL
     OR v_original_journal.reversed_by_id IS DISTINCT FROM v_correction.journal_entry_id
     OR v_correction.original_receipt_id IS DISTINCT FROM v_receipt.id THEN
    RAISE EXCEPTION 'customer receipt correction is not replaceable';
  END IF;
  IF EXISTS (SELECT 1 FROM public.customer_receipt_replacements
    WHERE original_correction_id = v_correction.id) THEN
    RAISE EXCEPTION 'customer receipt correction already has a replacement';
  END IF;
  IF p_replacement_date < v_correction.correction_date THEN
    RAISE EXCEPTION 'customer receipt replacement date cannot precede the correction date';
  END IF;
  SELECT id INTO v_period_id FROM public.accounting_periods
  WHERE org_id = v_receipt.org_id AND entity_id = v_receipt.entity_id
    AND p_replacement_date BETWEEN period_start AND period_end
    AND status = 'OPEN'
  FOR UPDATE;
  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'an OPEN accounting period is required for the customer receipt replacement';
  END IF;
  PERFORM set_config('tapaano.accounting_write', 'trusted', true);
  PERFORM set_config('tapaano.customer_receipt_replacement_write', 'trusted', true);
  INSERT INTO public.accounting_events (
    org_id, entity_id, event_type, source_type, source_id, idempotency_key,
    payload_hash, actor_id
  ) VALUES (
    v_receipt.org_id, v_receipt.entity_id, 'customer_receipt_replaced',
    'customer_receipt_replacement', v_replacement_id, p_idempotency_key,
    v_payload_hash, v_actor
  ) RETURNING id INTO v_event_id;
  INSERT INTO public.journal_entries (
    org_id, entity_id, entry_number, entry_date, memo, status, created_by,
    posted_at, source_module, accounting_period_id, accounting_event_id
  ) VALUES (
    v_receipt.org_id, v_receipt.entity_id,
    'RCR-' || left(p_replacement_number, 36) || '-'
      || left(md5(p_idempotency_key), 8),
    p_replacement_date,
    'Replacement customer receipt ' || p_replacement_number || ': ' || p_reference,
    'posted', v_actor, now(), 'ar_receipt_replacement', v_period_id, v_event_id
  ) RETURNING id INTO v_journal_id;
  INSERT INTO public.journal_lines (
    journal_entry_id, account_id, debit, credit, memo, org_id, entity_id,
    line_number
  )
  SELECT v_journal_id, account_id, debit, credit,
    'Replacement receipt: ' || COALESCE(memo, 'exact copy'),
    org_id, entity_id, line_number
  FROM public.journal_lines
  WHERE journal_entry_id = v_original_journal.id
  ORDER BY line_number;
  INSERT INTO public.customer_receipt_replacements (
    id, org_id, entity_id, customer_id, invoice_id, original_receipt_id,
    original_correction_id, replacement_number, replacement_date, currency,
    amount, reference, accounting_event_id, journal_entry_id, idempotency_key,
    payload_hash, posted_by, posted_at
  ) VALUES (
    v_replacement_id, v_receipt.org_id, v_receipt.entity_id,
    v_receipt.customer_id, v_receipt.invoice_id, v_receipt.id, v_correction.id,
    p_replacement_number, p_replacement_date, v_receipt.currency,
    v_receipt.amount, p_reference, v_event_id, v_journal_id,
    p_idempotency_key, v_payload_hash, v_actor, now()
  );
  UPDATE public.accounting_events SET journal_entry_id = v_journal_id
  WHERE id = v_event_id;
  PERFORM public.validate_customer_receipt_replacement_graph(v_replacement_id);
  RETURN v_replacement_id;
END;
$$;

DO $$
DECLARE
  replacement_record record;
BEGIN
  FOR replacement_record IN SELECT id FROM public.customer_receipt_replacements LOOP
    PERFORM public.validate_customer_receipt_replacement_graph(replacement_record.id);
  END LOOP;
END;
$$;

ALTER TABLE public.customer_receipt_replacements ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_record record;
  column_record record;
  role_name text;
  routine record;
  drop_kind text;
BEGIN
  FOR policy_record IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customer_receipt_replacements'
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I ON public.customer_receipt_replacements',
      policy_record.policyname
    );
  END LOOP;
  CREATE POLICY customer_receipt_replacements_tenant_read
    ON public.customer_receipt_replacements FOR SELECT TO authenticated
    USING (org_id = public.get_user_org_id());
  REVOKE ALL ON TABLE public.customer_receipt_replacements
    FROM PUBLIC, anon, authenticated, service_role;
  FOR column_record IN SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_receipt_replacements'
  LOOP
    EXECUTE format(
      'REVOKE ALL PRIVILEGES (%I) ON TABLE public.customer_receipt_replacements FROM PUBLIC',
      column_record.column_name
    );
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      EXECUTE format(
        'REVOKE ALL PRIVILEGES (%I) ON TABLE public.customer_receipt_replacements FROM %I',
        column_record.column_name, role_name
      );
    END LOOP;
  END LOOP;
  GRANT SELECT ON TABLE public.customer_receipt_replacements TO authenticated;
  IF EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'customer_receipt_replacements') THEN
    ALTER PUBLICATION supabase_realtime
      DROP TABLE public.customer_receipt_replacements;
  END IF;
  FOR routine IN SELECT namespace.nspname, procedure_info.proname,
      procedure_info.prokind,
      pg_get_function_identity_arguments(procedure_info.oid) AS args,
      oidvectortypes(procedure_info.proargtypes) AS types
    FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid = procedure_info.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure_info.proname = 'post_customer_receipt_replacement'
  LOOP
    IF routine.prokind <> 'f'
       OR routine.types <> 'uuid, text, date, text, text' THEN
      drop_kind := CASE WHEN routine.prokind = 'p'
        THEN 'PROCEDURE' ELSE 'FUNCTION' END;
      EXECUTE format('DROP %s %I.%I(%s)', drop_kind, routine.nspname,
        routine.proname, routine.args);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_customer_receipt_replacement_graph(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.post_customer_receipt_replacement(
  uuid, text, date, text, text
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.post_customer_receipt_replacement(
  uuid, text, date, text, text
) TO authenticated;

COMMIT;
