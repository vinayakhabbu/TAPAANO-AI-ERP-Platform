-- Controlled full customer credit notes for the verified zero-tax,
-- functional-currency invoice boundary. Partial credits, refunds, settlement,
-- tax and FX remain unavailable.

BEGIN;

LOCK TABLE public.invoices, public.invoice_lines, public.accounting_events,
  public.journal_entries, public.journal_lines IN SHARE ROW EXCLUSIVE MODE;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_lines_credit_source_uidx
  ON public.invoice_lines (org_id, entity_id, invoice_id, id);

CREATE TABLE IF NOT EXISTS public.customer_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  original_invoice_id uuid NOT NULL,
  credit_note_number text NOT NULL,
  issue_date date NOT NULL,
  currency text NOT NULL,
  total numeric(15,2) NOT NULL,
  reason text NOT NULL,
  account_control_id uuid NOT NULL,
  accounting_event_id uuid NOT NULL REFERENCES public.accounting_events(id),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id),
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  posted_by uuid NOT NULL REFERENCES auth.users(id),
  posted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_credit_notes_number_check CHECK (
    credit_note_number = btrim(credit_note_number)
    AND length(credit_note_number) BETWEEN 1 AND 80
    AND credit_note_number !~ '[[:cntrl:]]'
  ),
  CONSTRAINT customer_credit_notes_reason_check CHECK (
    reason = btrim(reason) AND length(reason) BETWEEN 1 AND 500
    AND reason !~ '[[:cntrl:]]'
  ),
  CONSTRAINT customer_credit_notes_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT customer_credit_notes_total_check CHECK (
    total::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND total > 0 AND round(total, 2) = total
  ),
  CONSTRAINT customer_credit_notes_key_check CHECK (
    idempotency_key = btrim(idempotency_key)
    AND length(idempotency_key) BETWEEN 1 AND 160
    AND idempotency_key !~ '[[:cntrl:]]'
    AND payload_hash ~ '^[0-9a-f]{32}$'
  ),
  CONSTRAINT customer_credit_notes_org_invoice_fkey
    FOREIGN KEY (org_id, entity_id, original_invoice_id)
    REFERENCES public.invoices(org_id, entity_id, id),
  CONSTRAINT customer_credit_notes_org_customer_fkey
    FOREIGN KEY (org_id, customer_id) REFERENCES public.customers(org_id, id),
  CONSTRAINT customer_credit_notes_org_control_fkey
    FOREIGN KEY (org_id, account_control_id)
    REFERENCES public.entity_invoice_account_controls(org_id, id),
  UNIQUE (org_id, credit_note_number),
  UNIQUE (org_id, idempotency_key),
  UNIQUE (original_invoice_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_credit_notes_org_entity_id_uidx
  ON public.customer_credit_notes (org_id, entity_id, id);

CREATE TABLE IF NOT EXISTS public.customer_credit_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  credit_note_id uuid NOT NULL,
  original_invoice_id uuid NOT NULL,
  original_invoice_line_id uuid NOT NULL,
  line_number integer NOT NULL,
  description text NOT NULL,
  quantity numeric(18,4) NOT NULL,
  unit_price numeric(18,4) NOT NULL,
  line_total numeric(15,2) NOT NULL,
  revenue_account_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_credit_note_lines_number_check CHECK (line_number > 0),
  CONSTRAINT customer_credit_note_lines_description_check CHECK (
    description = btrim(description) AND length(description) > 0
    AND description !~ '[[:cntrl:]]'
  ),
  CONSTRAINT customer_credit_note_lines_value_check CHECK (
    quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND line_total::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND quantity > 0 AND unit_price > 0 AND line_total > 0
    AND round(quantity, 4) = quantity
    AND round(unit_price, 4) = unit_price
    AND round(quantity * unit_price, 2) = line_total
  ),
  CONSTRAINT customer_credit_note_lines_org_credit_fkey
    FOREIGN KEY (org_id, entity_id, credit_note_id)
    REFERENCES public.customer_credit_notes(org_id, entity_id, id),
  CONSTRAINT customer_credit_note_lines_org_invoice_line_fkey
    FOREIGN KEY (org_id, entity_id, original_invoice_id, original_invoice_line_id)
    REFERENCES public.invoice_lines(org_id, entity_id, invoice_id, id),
  CONSTRAINT customer_credit_note_lines_org_revenue_account_fkey
    FOREIGN KEY (org_id, revenue_account_id) REFERENCES public.accounts(org_id, id),
  UNIQUE (credit_note_id, line_number),
  UNIQUE (credit_note_id, original_invoice_line_id)
);

LOCK TABLE public.customer_credit_notes, public.customer_credit_note_lines
  IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.accounting_events
  DROP CONSTRAINT IF EXISTS accounting_events_type_check;
ALTER TABLE public.accounting_events
  ADD CONSTRAINT accounting_events_type_check CHECK (
    event_type IN (
      'manual_journal_posted', 'journal_reversed', 'customer_invoice_posted',
      'customer_credit_note_posted'
    )
  );
ALTER TABLE public.accounting_events
  DROP CONSTRAINT IF EXISTS accounting_events_source_type_check;
ALTER TABLE public.accounting_events
  ADD CONSTRAINT accounting_events_source_type_check CHECK (
    source_type IN (
      'manual_journal', 'journal_reversal', 'customer_invoice',
      'customer_credit_note'
    )
  );
ALTER TABLE public.accounting_events
  DROP CONSTRAINT IF EXISTS accounting_events_source_shape_check;
ALTER TABLE public.accounting_events
  ADD CONSTRAINT accounting_events_source_shape_check CHECK (
    (source_type = 'manual_journal' AND source_id IS NULL)
    OR (source_type IN ('journal_reversal', 'customer_invoice', 'customer_credit_note')
      AND source_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.guard_customer_credit_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('tapaano.invoice_credit_write', true) IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'customer credit note is immutable; use the trusted full-credit workflow';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_invoice_accounting_graph()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_source_type text;
BEGIN
  IF TG_TABLE_NAME = 'accounting_events' THEN
    IF OLD.source_type = 'customer_invoice'
       AND current_setting('tapaano.invoice_write', true) IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'invoice accounting event is immutable';
    ELSIF OLD.source_type = 'customer_credit_note'
       AND current_setting('tapaano.invoice_credit_write', true) IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'customer credit note accounting event is immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'journal_entries' THEN
    IF TG_OP = 'INSERT' AND NEW.reversal_of_id IS NOT NULL THEN
      SELECT event.source_type INTO v_source_type
      FROM public.journal_entries original
      JOIN public.accounting_events event ON event.id = original.accounting_event_id
      WHERE original.id = NEW.reversal_of_id;
      IF v_source_type = 'customer_invoice'
         AND current_setting('tapaano.invoice_credit_write', true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'invoice journal reversal requires the trusted full-credit workflow';
      ELSIF v_source_type = 'customer_credit_note' THEN
        RAISE EXCEPTION 'customer credit-note reversal is unavailable';
      END IF;
    ELSIF TG_OP IN ('UPDATE', 'DELETE') THEN
      SELECT source_type INTO v_source_type
      FROM public.accounting_events WHERE id = OLD.accounting_event_id;
      IF v_source_type = 'customer_invoice'
         AND current_setting('tapaano.invoice_write', true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'invoice journal is immutable outside the customer-invoice workflow';
      ELSIF v_source_type = 'customer_credit_note'
         AND current_setting('tapaano.invoice_credit_write', true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'customer credit-note journal is immutable';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_customer_credit_note_graph(p_credit_note_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_credit public.customer_credit_notes%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_event public.accounting_events%ROWTYPE;
  v_journal public.journal_entries%ROWTYPE;
  v_original_journal public.journal_entries%ROWTYPE;
  v_period public.accounting_periods%ROWTYPE;
  v_credit_line_count integer;
  v_invoice_line_count integer;
  v_credit_total numeric;
BEGIN
  SELECT * INTO v_credit FROM public.customer_credit_notes WHERE id = p_credit_note_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_credit.credit_note_number IS NULL
     OR v_credit.credit_note_number IS DISTINCT FROM btrim(v_credit.credit_note_number)
     OR length(v_credit.credit_note_number) NOT BETWEEN 1 AND 80
     OR v_credit.credit_note_number ~ '[[:cntrl:]]'
     OR v_credit.reason IS NULL OR v_credit.reason IS DISTINCT FROM btrim(v_credit.reason)
     OR length(v_credit.reason) NOT BETWEEN 1 AND 500
     OR v_credit.reason ~ '[[:cntrl:]]'
     OR v_credit.currency !~ '^[A-Z]{3}$'
     OR v_credit.total::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_credit.total <= 0 OR round(v_credit.total, 2) IS DISTINCT FROM v_credit.total
     OR v_credit.accounting_event_id IS NULL OR v_credit.journal_entry_id IS NULL
     OR v_credit.posted_by IS NULL OR v_credit.posted_at IS NULL THEN
    RAISE EXCEPTION 'customer credit note header is not canonical';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_credit.original_invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer credit note original invoice is missing'; END IF;
  PERFORM public.validate_customer_invoice_graph(v_invoice.id);
  IF v_invoice.org_id IS DISTINCT FROM v_credit.org_id
     OR v_invoice.entity_id IS DISTINCT FROM v_credit.entity_id
     OR v_invoice.customer_id IS DISTINCT FROM v_credit.customer_id
     OR v_invoice.account_control_id IS DISTINCT FROM v_credit.account_control_id
     OR v_invoice.total IS DISTINCT FROM v_credit.total
     OR upper(v_invoice.currency) IS DISTINCT FROM v_credit.currency
     OR v_credit.issue_date < v_invoice.issue_date THEN
    RAISE EXCEPTION 'customer credit note does not match its original invoice';
  END IF;

  SELECT * INTO v_event FROM public.accounting_events WHERE id = v_credit.accounting_event_id;
  IF NOT FOUND
     OR v_event.org_id IS DISTINCT FROM v_credit.org_id
     OR v_event.entity_id IS DISTINCT FROM v_credit.entity_id
     OR v_event.event_type IS DISTINCT FROM 'customer_credit_note_posted'
     OR v_event.source_type IS DISTINCT FROM 'customer_credit_note'
     OR v_event.source_id IS DISTINCT FROM v_credit.id
     OR v_event.journal_entry_id IS DISTINCT FROM v_credit.journal_entry_id
     OR v_event.idempotency_key IS DISTINCT FROM v_credit.idempotency_key
     OR v_event.payload_hash IS DISTINCT FROM v_credit.payload_hash
     OR v_event.actor_id IS DISTINCT FROM v_credit.posted_by THEN
    RAISE EXCEPTION 'customer credit note event graph is invalid';
  END IF;

  SELECT * INTO v_journal FROM public.journal_entries WHERE id = v_credit.journal_entry_id;
  SELECT * INTO v_original_journal FROM public.journal_entries WHERE id = v_invoice.journal_entry_id;
  IF v_journal.id IS NULL OR v_original_journal.id IS NULL
     OR v_journal.org_id IS DISTINCT FROM v_credit.org_id
     OR v_journal.entity_id IS DISTINCT FROM v_credit.entity_id
     OR v_journal.status::text IS DISTINCT FROM 'posted'
     OR v_journal.source_module IS DISTINCT FROM 'ar_credit'
     OR v_journal.entry_date IS DISTINCT FROM v_credit.issue_date
     OR v_journal.accounting_event_id IS DISTINCT FROM v_credit.accounting_event_id
     OR v_journal.created_by IS DISTINCT FROM v_credit.posted_by
     OR v_journal.accounting_period_id IS NULL
     OR v_journal.reversal_of_id IS DISTINCT FROM v_original_journal.id
     OR v_original_journal.reversed_by_id IS DISTINCT FROM v_journal.id THEN
    RAISE EXCEPTION 'customer credit note journal graph is invalid';
  END IF;

  SELECT * INTO v_period FROM public.accounting_periods WHERE id = v_journal.accounting_period_id;
  IF v_period.id IS NULL
     OR v_period.org_id IS DISTINCT FROM v_credit.org_id
     OR v_period.entity_id IS DISTINCT FROM v_credit.entity_id
     OR v_credit.issue_date NOT BETWEEN v_period.period_start AND v_period.period_end THEN
    RAISE EXCEPTION 'customer credit note period graph is invalid';
  END IF;

  SELECT count(*), COALESCE(sum(line_total), 0)
    INTO v_credit_line_count, v_credit_total
  FROM public.customer_credit_note_lines
  WHERE credit_note_id = v_credit.id;
  SELECT count(*) INTO v_invoice_line_count
  FROM public.invoice_lines WHERE invoice_id = v_invoice.id;
  IF v_credit_line_count IS DISTINCT FROM v_invoice_line_count
     OR v_credit_line_count < 1
     OR v_credit_total IS DISTINCT FROM v_credit.total
     OR EXISTS (
       SELECT 1
       FROM public.customer_credit_note_lines credit_line
       FULL JOIN public.invoice_lines invoice_line
         ON invoice_line.id = credit_line.original_invoice_line_id
        AND invoice_line.invoice_id = v_invoice.id
       WHERE credit_line.credit_note_id = v_credit.id
         AND (
           invoice_line.id IS NULL
           OR credit_line.org_id IS DISTINCT FROM invoice_line.org_id
           OR credit_line.entity_id IS DISTINCT FROM invoice_line.entity_id
           OR credit_line.original_invoice_id IS DISTINCT FROM invoice_line.invoice_id
           OR credit_line.line_number IS DISTINCT FROM invoice_line.line_number
           OR credit_line.description IS DISTINCT FROM invoice_line.description
           OR credit_line.quantity IS DISTINCT FROM invoice_line.quantity
           OR credit_line.unit_price IS DISTINCT FROM invoice_line.unit_price
           OR credit_line.line_total IS DISTINCT FROM invoice_line.line_total
           OR credit_line.revenue_account_id IS DISTINCT FROM invoice_line.revenue_account_id
         )
     )
     OR EXISTS (
       SELECT 1 FROM public.invoice_lines invoice_line
       WHERE invoice_line.invoice_id = v_invoice.id
         AND NOT EXISTS (
           SELECT 1 FROM public.customer_credit_note_lines credit_line
           WHERE credit_line.credit_note_id = v_credit.id
             AND credit_line.original_invoice_line_id = invoice_line.id
         )
     ) THEN
    RAISE EXCEPTION 'customer credit note lines do not exactly copy the invoice';
  END IF;

  IF (SELECT count(*) FROM public.journal_lines WHERE journal_entry_id = v_journal.id)
       IS DISTINCT FROM
     (SELECT count(*) FROM public.journal_lines WHERE journal_entry_id = v_original_journal.id)
     OR EXISTS (
       SELECT 1
       FROM public.journal_lines original_line
       LEFT JOIN public.journal_lines credit_line
         ON credit_line.journal_entry_id = v_journal.id
        AND credit_line.line_number = original_line.line_number
       WHERE original_line.journal_entry_id = v_original_journal.id
         AND (
           credit_line.id IS NULL
           OR credit_line.org_id IS DISTINCT FROM original_line.org_id
           OR credit_line.entity_id IS DISTINCT FROM original_line.entity_id
           OR credit_line.account_id IS DISTINCT FROM original_line.account_id
           OR credit_line.debit IS DISTINCT FROM original_line.credit
           OR credit_line.credit IS DISTINCT FROM original_line.debit
         )
     ) THEN
    RAISE EXCEPTION 'customer credit note journal is not an exact offset';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_customer_credit_note_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_credit_note_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'customer_credit_notes' THEN
    IF TG_OP = 'DELETE' THEN v_credit_note_id := OLD.id; ELSE v_credit_note_id := NEW.id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN v_credit_note_id := OLD.credit_note_id; ELSE v_credit_note_id := NEW.credit_note_id; END IF;
  END IF;
  PERFORM public.validate_customer_credit_note_graph(v_credit_note_id);
  RETURN NULL;
END;
$$;

DO $$
DECLARE
  target_table text;
  trigger_record record;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['customer_credit_notes', 'customer_credit_note_lines'] LOOP
    FOR trigger_record IN
      SELECT trigger_info.tgname
      FROM pg_trigger trigger_info
      JOIN pg_class relation ON relation.oid = trigger_info.tgrelid
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public' AND relation.relname = target_table
        AND NOT trigger_info.tgisinternal
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', trigger_record.tgname, target_table);
    END LOOP;
    EXECUTE format(
      'CREATE TRIGGER guard_customer_credit_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I '
      'FOR EACH ROW EXECUTE FUNCTION public.guard_customer_credit_write()', target_table
    );
    EXECUTE format(
      'CREATE TRIGGER guard_customer_credit_truncate BEFORE TRUNCATE ON public.%I '
      'FOR EACH STATEMENT EXECUTE FUNCTION public.guard_customer_credit_write()', target_table
    );
    EXECUTE format(
      'CREATE CONSTRAINT TRIGGER validate_customer_credit_deferred '
      'AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED '
      'FOR EACH ROW EXECUTE FUNCTION public.validate_customer_credit_note_trigger()', target_table
    );
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_customer_credit_note(
  p_invoice_id uuid,
  p_credit_note_number text,
  p_credit_date date,
  p_reason text,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_original_journal public.journal_entries%ROWTYPE;
  v_actor_org uuid;
  v_actor uuid;
  v_period_id uuid;
  v_credit_note_id uuid := gen_random_uuid();
  v_event_id uuid;
  v_journal_id uuid;
  v_existing_credit_note_id uuid;
  v_existing_invoice_id uuid;
  v_existing_hash text;
  v_payload_hash text;
BEGIN
  v_actor_org := public.get_user_org_id();
  IF v_actor_org IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor := public.assert_accounting_actor(v_actor_org);
  SELECT * INTO v_invoice FROM public.invoices
  WHERE id = p_invoice_id AND org_id = v_actor_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'posted customer invoice not found or unavailable'; END IF;

  IF p_credit_note_number IS NULL
     OR p_credit_note_number IS DISTINCT FROM btrim(p_credit_note_number)
     OR length(p_credit_note_number) NOT BETWEEN 1 AND 80
     OR p_credit_note_number ~ '[[:cntrl:]]'
     OR p_credit_date IS NULL
     OR p_reason IS NULL OR p_reason IS DISTINCT FROM btrim(p_reason)
     OR length(p_reason) NOT BETWEEN 1 AND 500 OR p_reason ~ '[[:cntrl:]]'
     OR p_idempotency_key IS NULL
     OR p_idempotency_key IS DISTINCT FROM btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 160
     OR p_idempotency_key ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid customer credit note request';
  END IF;

  v_payload_hash := md5(jsonb_build_object(
    'invoice_id', p_invoice_id,
    'credit_note_number', p_credit_note_number,
    'credit_date', p_credit_date,
    'reason', p_reason
  )::text);

  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.accounting_events IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.customer_credit_notes IN SHARE ROW EXCLUSIVE MODE;

  SELECT id, original_invoice_id, payload_hash
    INTO v_existing_credit_note_id, v_existing_invoice_id, v_existing_hash
  FROM public.customer_credit_notes
  WHERE org_id = v_invoice.org_id AND idempotency_key = p_idempotency_key;
  IF v_existing_credit_note_id IS NOT NULL THEN
    IF v_existing_invoice_id IS DISTINCT FROM p_invoice_id
       OR v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'customer credit note idempotency key conflicts with another payload';
    END IF;
    PERFORM public.validate_customer_credit_note_graph(v_existing_credit_note_id);
    RETURN v_existing_credit_note_id;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
  WHERE id = p_invoice_id AND org_id = v_actor_org FOR UPDATE;
  IF NOT FOUND OR v_invoice.accounting_status IS DISTINCT FROM 'POSTED' THEN
    RAISE EXCEPTION 'only a verified posted customer invoice can be credited';
  END IF;
  PERFORM public.validate_customer_invoice_graph(v_invoice.id);
  IF p_credit_date < v_invoice.issue_date THEN
    RAISE EXCEPTION 'credit date cannot precede the original invoice';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.customer_credit_notes WHERE original_invoice_id = v_invoice.id
  ) THEN
    RAISE EXCEPTION 'customer invoice already has a full credit note';
  END IF;

  SELECT * INTO v_original_journal
  FROM public.journal_entries WHERE id = v_invoice.journal_entry_id FOR UPDATE;
  IF NOT FOUND OR v_original_journal.status::text IS DISTINCT FROM 'posted'
     OR v_original_journal.reversal_of_id IS NOT NULL
     OR v_original_journal.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'customer invoice journal cannot be credited';
  END IF;

  SELECT id INTO v_period_id
  FROM public.accounting_periods
  WHERE org_id = v_invoice.org_id AND entity_id = v_invoice.entity_id
    AND p_credit_date BETWEEN period_start AND period_end AND status = 'OPEN'
  FOR UPDATE;
  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'an OPEN accounting period is required for the customer credit note';
  END IF;

  PERFORM set_config('tapaano.accounting_write', 'trusted', true);
  PERFORM set_config('tapaano.invoice_write', 'trusted', true);
  PERFORM set_config('tapaano.invoice_credit_write', 'trusted', true);

  INSERT INTO public.accounting_events (
    org_id, entity_id, event_type, source_type, source_id, idempotency_key,
    payload_hash, actor_id
  ) VALUES (
    v_invoice.org_id, v_invoice.entity_id, 'customer_credit_note_posted',
    'customer_credit_note', v_credit_note_id, p_idempotency_key, v_payload_hash, v_actor
  ) RETURNING id INTO v_event_id;

  INSERT INTO public.journal_entries (
    org_id, entity_id, entry_number, entry_date, memo, status, created_by,
    posted_at, source_module, accounting_period_id, accounting_event_id, reversal_of_id
  ) VALUES (
    v_invoice.org_id, v_invoice.entity_id,
    'CR-' || left(p_credit_note_number, 40) || '-' || left(md5(p_idempotency_key), 8),
    p_credit_date, 'Customer credit ' || p_credit_note_number || ': ' || p_reason,
    'posted', v_actor, now(), 'ar_credit', v_period_id, v_event_id,
    v_original_journal.id
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_lines (
    journal_entry_id, account_id, debit, credit, memo, org_id, entity_id, line_number
  )
  SELECT v_journal_id, account_id, credit, debit,
    COALESCE(memo, 'Customer credit'), org_id, entity_id, line_number
  FROM public.journal_lines
  WHERE journal_entry_id = v_original_journal.id
  ORDER BY line_number;

  UPDATE public.accounting_events SET journal_entry_id = v_journal_id WHERE id = v_event_id;

  INSERT INTO public.customer_credit_notes (
    id, org_id, entity_id, customer_id, original_invoice_id,
    credit_note_number, issue_date, currency, total, reason, account_control_id,
    accounting_event_id, journal_entry_id, idempotency_key, payload_hash,
    posted_by, posted_at
  ) VALUES (
    v_credit_note_id, v_invoice.org_id, v_invoice.entity_id, v_invoice.customer_id,
    v_invoice.id, p_credit_note_number, p_credit_date, upper(v_invoice.currency),
    v_invoice.total, p_reason, v_invoice.account_control_id, v_event_id,
    v_journal_id, p_idempotency_key, v_payload_hash, v_actor, now()
  );

  INSERT INTO public.customer_credit_note_lines (
    org_id, entity_id, credit_note_id, original_invoice_id,
    original_invoice_line_id, line_number, description, quantity, unit_price,
    line_total, revenue_account_id
  )
  SELECT org_id, entity_id, v_credit_note_id, invoice_id, id, line_number,
    description, quantity, unit_price, line_total, revenue_account_id
  FROM public.invoice_lines
  WHERE invoice_id = v_invoice.id
  ORDER BY line_number;

  UPDATE public.journal_entries
  SET reversed_by_id = v_journal_id
  WHERE id = v_original_journal.id;

  PERFORM public.validate_customer_credit_note_graph(v_credit_note_id);
  RETURN v_credit_note_id;
END;
$$;

DO $$
DECLARE
  credit_record record;
BEGIN
  FOR credit_record IN SELECT id FROM public.customer_credit_notes LOOP
    PERFORM public.validate_customer_credit_note_graph(credit_record.id);
  END LOOP;
END;
$$;

ALTER TABLE public.customer_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_credit_note_lines ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_table text;
  policy_record record;
  column_record record;
  role_name text;
  function_record record;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['customer_credit_notes', 'customer_credit_note_lines'] LOOP
    FOR policy_record IN
      SELECT policy_info.policyname FROM pg_policies policy_info
      WHERE policy_info.schemaname='public' AND policy_info.tablename=target_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_record.policyname, target_table);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated '
      'USING (org_id = public.get_user_org_id())',
      target_table || '_tenant_read', target_table
    );
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', target_table);
    FOR column_record IN
      SELECT column_info.column_name FROM information_schema.columns column_info
      WHERE column_info.table_schema='public' AND column_info.table_name=target_table
    LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC', column_record.column_name, target_table);
      FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM %I',
          column_record.column_name, target_table, role_name);
      END LOOP;
    END LOOP;
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', target_table);
    IF EXISTS (
      SELECT 1 FROM pg_publication_tables publication_info
      WHERE publication_info.pubname='supabase_realtime'
        AND publication_info.schemaname='public'
        AND publication_info.tablename=target_table
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', target_table);
    END IF;
  END LOOP;

  FOR function_record IN
    SELECT namespace.nspname, procedure_info.proname,
      pg_get_function_identity_arguments(procedure_info.oid) AS identity_arguments
    FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid=procedure_info.pronamespace
    WHERE namespace.nspname='public'
      AND procedure_info.proname='post_customer_credit_note'
      AND oidvectortypes(procedure_info.proargtypes) <> 'uuid, text, date, text, text'
  LOOP
    EXECUTE format('DROP FUNCTION %I.%I(%s)', function_record.nspname,
      function_record.proname, function_record.identity_arguments);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_customer_credit_note_graph(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.post_customer_credit_note(uuid, text, date, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.post_customer_credit_note(uuid, text, date, text, text)
  TO authenticated;

COMMIT;
