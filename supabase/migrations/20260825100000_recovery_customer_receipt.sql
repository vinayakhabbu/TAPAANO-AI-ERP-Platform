-- Controlled full customer receipts for the verified zero-tax,
-- functional-currency invoice boundary. This records a manual receipt into an
-- immutable cash-clearing/AR journal. Partial application, overpayment, refund,
-- FX, bank matching, and reconciliation remain unavailable.

BEGIN;

LOCK TABLE public.entities, public.accounts, public.customers,
  public.entity_invoice_account_controls, public.invoices,
  public.customer_credit_notes, public.accounting_events,
  public.accounting_periods, public.journal_entries, public.journal_lines
  IN SHARE ROW EXCLUSIVE MODE;

CREATE UNIQUE INDEX IF NOT EXISTS entity_invoice_controls_receipt_source_uidx
  ON public.entity_invoice_account_controls (org_id, entity_id, id, ar_account_id);

CREATE TABLE IF NOT EXISTS public.entity_customer_receipt_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  invoice_account_control_id uuid NOT NULL,
  ar_account_id uuid NOT NULL,
  cash_account_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  configured_by uuid NOT NULL REFERENCES auth.users(id),
  configured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_customer_receipt_controls_accounts_distinct_check
    CHECK (ar_account_id <> cash_account_id),
  CONSTRAINT entity_customer_receipt_controls_key_check CHECK (
    idempotency_key = btrim(idempotency_key)
    AND length(idempotency_key) BETWEEN 1 AND 160
    AND idempotency_key !~ '[[:cntrl:]]'
  ),
  CONSTRAINT entity_customer_receipt_controls_invoice_control_fkey
    FOREIGN KEY (org_id, entity_id, invoice_account_control_id, ar_account_id)
    REFERENCES public.entity_invoice_account_controls(org_id, entity_id, id, ar_account_id),
  CONSTRAINT entity_customer_receipt_controls_cash_account_fkey
    FOREIGN KEY (org_id, cash_account_id) REFERENCES public.accounts(org_id, id),
  UNIQUE (org_id, entity_id),
  UNIQUE (org_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_customer_receipt_controls_org_entity_id_uidx
  ON public.entity_customer_receipt_controls (org_id, entity_id, id);

CREATE TABLE IF NOT EXISTS public.customer_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  receipt_number text NOT NULL,
  receipt_date date NOT NULL,
  currency text NOT NULL,
  amount numeric(15,2) NOT NULL,
  receipt_reference text NOT NULL,
  account_control_id uuid NOT NULL,
  accounting_event_id uuid NOT NULL REFERENCES public.accounting_events(id),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id),
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  posted_by uuid NOT NULL REFERENCES auth.users(id),
  posted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_receipts_number_check CHECK (
    receipt_number = btrim(receipt_number)
    AND length(receipt_number) BETWEEN 1 AND 80
    AND receipt_number !~ '[[:cntrl:]]'
  ),
  CONSTRAINT customer_receipts_reference_check CHECK (
    receipt_reference = btrim(receipt_reference)
    AND length(receipt_reference) BETWEEN 1 AND 240
    AND receipt_reference !~ '[[:cntrl:]]'
  ),
  CONSTRAINT customer_receipts_currency_check CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT customer_receipts_amount_check CHECK (
    amount::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND amount > 0 AND round(amount, 2) = amount
  ),
  CONSTRAINT customer_receipts_key_check CHECK (
    idempotency_key = btrim(idempotency_key)
    AND length(idempotency_key) BETWEEN 1 AND 160
    AND idempotency_key !~ '[[:cntrl:]]'
    AND payload_hash ~ '^[0-9a-f]{32}$'
  ),
  CONSTRAINT customer_receipts_org_invoice_fkey
    FOREIGN KEY (org_id, entity_id, invoice_id)
    REFERENCES public.invoices(org_id, entity_id, id),
  CONSTRAINT customer_receipts_org_customer_fkey
    FOREIGN KEY (org_id, customer_id) REFERENCES public.customers(org_id, id),
  CONSTRAINT customer_receipts_org_control_fkey
    FOREIGN KEY (org_id, entity_id, account_control_id)
    REFERENCES public.entity_customer_receipt_controls(org_id, entity_id, id),
  UNIQUE (org_id, receipt_number),
  UNIQUE (org_id, idempotency_key),
  UNIQUE (invoice_id),
  UNIQUE (accounting_event_id),
  UNIQUE (journal_entry_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_receipts_org_entity_id_uidx
  ON public.customer_receipts (org_id, entity_id, id);

LOCK TABLE public.entity_customer_receipt_controls, public.customer_receipts
  IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.accounting_events
  DROP CONSTRAINT IF EXISTS accounting_events_type_check;
ALTER TABLE public.accounting_events
  ADD CONSTRAINT accounting_events_type_check CHECK (
    event_type IN (
      'manual_journal_posted', 'journal_reversed', 'customer_invoice_posted',
      'customer_credit_note_posted', 'customer_receipt_posted'
    )
  );
ALTER TABLE public.accounting_events
  DROP CONSTRAINT IF EXISTS accounting_events_source_type_check;
ALTER TABLE public.accounting_events
  ADD CONSTRAINT accounting_events_source_type_check CHECK (
    source_type IN (
      'manual_journal', 'journal_reversal', 'customer_invoice',
      'customer_credit_note', 'customer_receipt'
    )
  );
ALTER TABLE public.accounting_events
  DROP CONSTRAINT IF EXISTS accounting_events_source_shape_check;
ALTER TABLE public.accounting_events
  ADD CONSTRAINT accounting_events_source_shape_check CHECK (
    (source_type = 'manual_journal' AND source_id IS NULL)
    OR (source_type IN (
      'journal_reversal', 'customer_invoice', 'customer_credit_note',
      'customer_receipt'
    ) AND source_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.guard_customer_receipt_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('tapaano.customer_receipt_write', true) IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'customer receipt is immutable; use the trusted full-receipt workflow';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_invoice_receipt_conflict()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'customer_receipts' THEN
    v_invoice_id := NEW.invoice_id;
    IF EXISTS (
      SELECT 1 FROM public.customer_credit_notes
      WHERE original_invoice_id = v_invoice_id
    ) THEN
      RAISE EXCEPTION 'customer invoice already has a full credit and cannot receive a receipt';
    END IF;
  ELSE
    v_invoice_id := NEW.original_invoice_id;
    IF EXISTS (
      SELECT 1 FROM public.customer_receipts WHERE invoice_id = v_invoice_id
    ) THEN
      RAISE EXCEPTION 'customer invoice already has a full receipt and cannot be credited';
    END IF;
  END IF;
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
    ELSIF OLD.source_type = 'customer_receipt'
       AND current_setting('tapaano.customer_receipt_write', true) IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'customer receipt accounting event is immutable';
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
      ELSIF v_source_type = 'customer_receipt' THEN
        RAISE EXCEPTION 'customer receipt reversal is unavailable';
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
      ELSIF v_source_type = 'customer_receipt'
         AND current_setting('tapaano.customer_receipt_write', true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'customer receipt journal is immutable';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_customer_receipt_graph(p_receipt_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_receipt public.customer_receipts%ROWTYPE;
  v_invoice public.invoices%ROWTYPE;
  v_control public.entity_customer_receipt_controls%ROWTYPE;
  v_invoice_control public.entity_invoice_account_controls%ROWTYPE;
  v_event public.accounting_events%ROWTYPE;
  v_journal public.journal_entries%ROWTYPE;
  v_period public.accounting_periods%ROWTYPE;
  v_cash_type public.account_type;
  v_line_count integer;
  v_debit numeric;
  v_credit numeric;
  v_cash_lines integer;
  v_ar_lines integer;
BEGIN
  SELECT * INTO v_receipt FROM public.customer_receipts WHERE id = p_receipt_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_receipt.receipt_number IS NULL
     OR v_receipt.receipt_number IS DISTINCT FROM btrim(v_receipt.receipt_number)
     OR length(v_receipt.receipt_number) NOT BETWEEN 1 AND 80
     OR v_receipt.receipt_number ~ '[[:cntrl:]]'
     OR v_receipt.receipt_reference IS NULL
     OR v_receipt.receipt_reference IS DISTINCT FROM btrim(v_receipt.receipt_reference)
     OR length(v_receipt.receipt_reference) NOT BETWEEN 1 AND 240
     OR v_receipt.receipt_reference ~ '[[:cntrl:]]'
     OR v_receipt.currency !~ '^[A-Z]{3}$'
     OR v_receipt.amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_receipt.amount <= 0 OR round(v_receipt.amount, 2) IS DISTINCT FROM v_receipt.amount
     OR v_receipt.account_control_id IS NULL
     OR v_receipt.accounting_event_id IS NULL OR v_receipt.journal_entry_id IS NULL
     OR v_receipt.posted_by IS NULL OR v_receipt.posted_at IS NULL THEN
    RAISE EXCEPTION 'customer receipt header is not canonical';
  END IF;

  SELECT * INTO v_invoice FROM public.invoices WHERE id = v_receipt.invoice_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'customer receipt invoice is missing'; END IF;
  PERFORM public.validate_customer_invoice_graph(v_invoice.id);
  IF v_invoice.org_id IS DISTINCT FROM v_receipt.org_id
     OR v_invoice.entity_id IS DISTINCT FROM v_receipt.entity_id
     OR v_invoice.customer_id IS DISTINCT FROM v_receipt.customer_id
     OR upper(v_invoice.currency) IS DISTINCT FROM v_receipt.currency
     OR v_invoice.total IS DISTINCT FROM v_receipt.amount
     OR v_receipt.receipt_date < v_invoice.issue_date
     OR EXISTS (
       SELECT 1 FROM public.customer_credit_notes
       WHERE original_invoice_id = v_invoice.id
     ) THEN
    RAISE EXCEPTION 'customer receipt does not exactly settle its invoice';
  END IF;

  SELECT * INTO v_control FROM public.entity_customer_receipt_controls
  WHERE id = v_receipt.account_control_id
    AND org_id = v_receipt.org_id AND entity_id = v_receipt.entity_id;
  SELECT * INTO v_invoice_control FROM public.entity_invoice_account_controls
  WHERE id = v_invoice.account_control_id
    AND org_id = v_invoice.org_id AND entity_id = v_invoice.entity_id;
  SELECT account_type INTO v_cash_type FROM public.accounts
  WHERE id = v_control.cash_account_id AND org_id = v_receipt.org_id;
  IF v_control.id IS NULL OR v_invoice_control.id IS NULL
     OR v_control.invoice_account_control_id IS DISTINCT FROM v_invoice_control.id
     OR v_control.ar_account_id IS DISTINCT FROM v_invoice_control.ar_account_id
     OR v_control.cash_account_id IS NULL
     OR v_control.cash_account_id = v_control.ar_account_id
     OR v_cash_type IS DISTINCT FROM 'asset' THEN
    RAISE EXCEPTION 'customer receipt account control is invalid';
  END IF;

  SELECT * INTO v_event FROM public.accounting_events WHERE id = v_receipt.accounting_event_id;
  IF NOT FOUND
     OR v_event.org_id IS DISTINCT FROM v_receipt.org_id
     OR v_event.entity_id IS DISTINCT FROM v_receipt.entity_id
     OR v_event.event_type IS DISTINCT FROM 'customer_receipt_posted'
     OR v_event.source_type IS DISTINCT FROM 'customer_receipt'
     OR v_event.source_id IS DISTINCT FROM v_receipt.id
     OR v_event.journal_entry_id IS DISTINCT FROM v_receipt.journal_entry_id
     OR v_event.idempotency_key IS DISTINCT FROM v_receipt.idempotency_key
     OR v_event.payload_hash IS DISTINCT FROM v_receipt.payload_hash
     OR v_event.actor_id IS DISTINCT FROM v_receipt.posted_by THEN
    RAISE EXCEPTION 'customer receipt event graph is invalid';
  END IF;

  SELECT * INTO v_journal FROM public.journal_entries WHERE id = v_receipt.journal_entry_id;
  IF NOT FOUND
     OR v_journal.org_id IS DISTINCT FROM v_receipt.org_id
     OR v_journal.entity_id IS DISTINCT FROM v_receipt.entity_id
     OR v_journal.status::text IS DISTINCT FROM 'posted'
     OR v_journal.source_module IS DISTINCT FROM 'ar_receipt'
     OR v_journal.entry_date IS DISTINCT FROM v_receipt.receipt_date
     OR v_journal.accounting_event_id IS DISTINCT FROM v_receipt.accounting_event_id
     OR v_journal.created_by IS DISTINCT FROM v_receipt.posted_by
     OR v_journal.accounting_period_id IS NULL
     OR v_journal.reversal_of_id IS NOT NULL
     OR v_journal.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'customer receipt journal graph is invalid';
  END IF;

  SELECT * INTO v_period FROM public.accounting_periods WHERE id = v_journal.accounting_period_id;
  IF v_period.id IS NULL
     OR v_period.org_id IS DISTINCT FROM v_receipt.org_id
     OR v_period.entity_id IS DISTINCT FROM v_receipt.entity_id
     OR v_receipt.receipt_date NOT BETWEEN v_period.period_start AND v_period.period_end THEN
    RAISE EXCEPTION 'customer receipt period graph is invalid';
  END IF;

  SELECT count(*), COALESCE(sum(debit), 0), COALESCE(sum(credit), 0),
    count(*) FILTER (
      WHERE account_id = v_control.cash_account_id
        AND debit = v_receipt.amount AND credit = 0
    ),
    count(*) FILTER (
      WHERE account_id = v_control.ar_account_id
        AND credit = v_receipt.amount AND debit = 0
    )
  INTO v_line_count, v_debit, v_credit, v_cash_lines, v_ar_lines
  FROM public.journal_lines WHERE journal_entry_id = v_journal.id;
  IF v_line_count IS DISTINCT FROM 2
     OR v_debit IS DISTINCT FROM v_receipt.amount
     OR v_credit IS DISTINCT FROM v_receipt.amount
     OR v_cash_lines IS DISTINCT FROM 1
     OR v_ar_lines IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'customer receipt journal lines do not reconcile';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_customer_receipt_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_receipt_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_receipt_id := OLD.id; ELSE v_receipt_id := NEW.id; END IF;
  PERFORM public.validate_customer_receipt_graph(v_receipt_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS guard_customer_receipt_write ON public.customer_receipts;
CREATE TRIGGER guard_customer_receipt_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.customer_receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_receipt_write();
DROP TRIGGER IF EXISTS guard_customer_receipt_truncate ON public.customer_receipts;
CREATE TRIGGER guard_customer_receipt_truncate
  BEFORE TRUNCATE ON public.customer_receipts
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_customer_receipt_write();
DROP TRIGGER IF EXISTS validate_customer_receipt_deferred ON public.customer_receipts;
CREATE CONSTRAINT TRIGGER validate_customer_receipt_deferred
  AFTER INSERT OR UPDATE OR DELETE ON public.customer_receipts
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_customer_receipt_trigger();

DROP TRIGGER IF EXISTS guard_customer_receipt_control_write ON public.entity_customer_receipt_controls;
CREATE TRIGGER guard_customer_receipt_control_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.entity_customer_receipt_controls
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_receipt_write();
DROP TRIGGER IF EXISTS guard_customer_receipt_control_truncate ON public.entity_customer_receipt_controls;
CREATE TRIGGER guard_customer_receipt_control_truncate
  BEFORE TRUNCATE ON public.entity_customer_receipt_controls
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_customer_receipt_write();

DROP TRIGGER IF EXISTS guard_invoice_receipt_conflict ON public.customer_receipts;
CREATE TRIGGER guard_invoice_receipt_conflict
  BEFORE INSERT ON public.customer_receipts
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_receipt_conflict();
DROP TRIGGER IF EXISTS guard_invoice_receipt_conflict ON public.customer_credit_notes;
CREATE TRIGGER guard_invoice_receipt_conflict
  BEFORE INSERT ON public.customer_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_receipt_conflict();

DROP TRIGGER IF EXISTS guard_invoice_events_graph ON public.accounting_events;
CREATE TRIGGER guard_invoice_events_graph
  BEFORE UPDATE OR DELETE ON public.accounting_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_accounting_graph();
DROP TRIGGER IF EXISTS guard_invoice_journals_graph ON public.journal_entries;
CREATE TRIGGER guard_invoice_journals_graph
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_accounting_graph();

CREATE OR REPLACE FUNCTION public.configure_entity_customer_receipt_accounts(
  p_entity_id uuid,
  p_cash_account_id uuid,
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
  v_invoice_control public.entity_invoice_account_controls%ROWTYPE;
  v_receipt_control public.entity_customer_receipt_controls%ROWTYPE;
  v_cash_type public.account_type;
BEGIN
  v_actor_org := public.get_user_org_id();
  IF v_actor_org IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor := public.assert_accounting_actor(v_actor_org);
  IF NOT EXISTS (
    SELECT 1 FROM public.entities WHERE id = p_entity_id AND org_id = v_actor_org
  ) THEN
    RAISE EXCEPTION 'entity not found or unavailable';
  END IF;
  IF p_idempotency_key IS NULL
     OR p_idempotency_key IS DISTINCT FROM btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 160
     OR p_idempotency_key ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid customer receipt account control request';
  END IF;

  LOCK TABLE public.entity_customer_receipt_controls IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_receipt_control FROM public.entity_customer_receipt_controls
  WHERE org_id = v_actor_org AND entity_id = p_entity_id;
  IF FOUND THEN
    IF v_receipt_control.cash_account_id IS DISTINCT FROM p_cash_account_id
       OR v_receipt_control.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
      RAISE EXCEPTION 'entity customer receipt account control is immutable';
    END IF;
    RETURN v_receipt_control.id;
  END IF;

  SELECT * INTO v_invoice_control FROM public.entity_invoice_account_controls
  WHERE org_id = v_actor_org AND entity_id = p_entity_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'entity invoice account control must be configured first';
  END IF;
  SELECT account_type INTO v_cash_type FROM public.accounts
  WHERE id = p_cash_account_id AND org_id = v_actor_org AND is_active = true FOR UPDATE;
  IF NOT FOUND OR v_cash_type IS DISTINCT FROM 'asset'
     OR p_cash_account_id = v_invoice_control.ar_account_id THEN
    RAISE EXCEPTION 'cash control must be a distinct active asset account in the organization';
  END IF;

  PERFORM set_config('tapaano.customer_receipt_write', 'trusted', true);
  INSERT INTO public.entity_customer_receipt_controls (
    org_id, entity_id, invoice_account_control_id, ar_account_id,
    cash_account_id, idempotency_key, configured_by
  ) VALUES (
    v_actor_org, p_entity_id, v_invoice_control.id, v_invoice_control.ar_account_id,
    p_cash_account_id, p_idempotency_key, v_actor
  ) RETURNING * INTO v_receipt_control;
  RETURN v_receipt_control.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_customer_receipt(
  p_invoice_id uuid,
  p_receipt_number text,
  p_receipt_date date,
  p_currency text,
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
  v_invoice public.invoices%ROWTYPE;
  v_control public.entity_customer_receipt_controls%ROWTYPE;
  v_period_id uuid;
  v_receipt_id uuid := gen_random_uuid();
  v_event_id uuid;
  v_journal_id uuid;
  v_existing_receipt_id uuid;
  v_existing_invoice_id uuid;
  v_existing_hash text;
  v_payload_hash text;
  v_cash_type public.account_type;
BEGIN
  v_actor_org := public.get_user_org_id();
  IF v_actor_org IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor := public.assert_accounting_actor(v_actor_org);

  IF p_receipt_number IS NULL
     OR p_receipt_number IS DISTINCT FROM btrim(p_receipt_number)
     OR length(p_receipt_number) NOT BETWEEN 1 AND 80
     OR p_receipt_number ~ '[[:cntrl:]]'
     OR p_receipt_date IS NULL
     OR p_currency IS NULL OR upper(p_currency) !~ '^[A-Z]{3}$'
     OR p_reference IS NULL OR p_reference IS DISTINCT FROM btrim(p_reference)
     OR length(p_reference) NOT BETWEEN 1 AND 240 OR p_reference ~ '[[:cntrl:]]'
     OR p_idempotency_key IS NULL
     OR p_idempotency_key IS DISTINCT FROM btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 160
     OR p_idempotency_key ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid full customer receipt request';
  END IF;

  v_payload_hash := md5(jsonb_build_object(
    'invoice_id', p_invoice_id,
    'receipt_number', p_receipt_number,
    'receipt_date', p_receipt_date,
    'currency', upper(p_currency),
    'reference', p_reference
  )::text);

  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.accounting_events IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.customer_receipts IN SHARE ROW EXCLUSIVE MODE;

  SELECT id, invoice_id, payload_hash
    INTO v_existing_receipt_id, v_existing_invoice_id, v_existing_hash
  FROM public.customer_receipts
  WHERE org_id = v_actor_org AND idempotency_key = p_idempotency_key;
  IF v_existing_receipt_id IS NOT NULL THEN
    IF v_existing_invoice_id IS DISTINCT FROM p_invoice_id
       OR v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'customer receipt idempotency key conflicts with another payload';
    END IF;
    PERFORM public.validate_customer_receipt_graph(v_existing_receipt_id);
    RETURN v_existing_receipt_id;
  END IF;

  SELECT * INTO v_invoice FROM public.invoices
  WHERE id = p_invoice_id AND org_id = v_actor_org FOR UPDATE;
  IF NOT FOUND OR v_invoice.accounting_status IS DISTINCT FROM 'POSTED' THEN
    RAISE EXCEPTION 'posted customer invoice not found or unavailable';
  END IF;
  PERFORM public.validate_customer_invoice_graph(v_invoice.id);
  IF EXISTS (
    SELECT 1 FROM public.customer_credit_notes WHERE original_invoice_id = v_invoice.id
  ) THEN
    RAISE EXCEPTION 'customer invoice already has a full credit and cannot receive a receipt';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.customer_receipts WHERE invoice_id = v_invoice.id
  ) THEN
    RAISE EXCEPTION 'customer invoice already has a full receipt';
  END IF;
  IF p_receipt_date < v_invoice.issue_date THEN
    RAISE EXCEPTION 'customer receipt date cannot precede the invoice date';
  END IF;
  IF upper(p_currency) IS DISTINCT FROM upper(v_invoice.currency) THEN
    RAISE EXCEPTION 'customer receipt must use the invoice functional currency';
  END IF;
  SELECT * INTO v_control FROM public.entity_customer_receipt_controls
  WHERE org_id = v_invoice.org_id AND entity_id = v_invoice.entity_id FOR UPDATE;
  IF NOT FOUND
     OR v_control.invoice_account_control_id IS DISTINCT FROM v_invoice.account_control_id THEN
    RAISE EXCEPTION 'entity customer receipt account control is not configured';
  END IF;
  SELECT account_type INTO v_cash_type FROM public.accounts
  WHERE id = v_control.cash_account_id AND org_id = v_invoice.org_id
    AND is_active = true FOR UPDATE;
  IF NOT FOUND OR v_cash_type IS DISTINCT FROM 'asset' THEN
    RAISE EXCEPTION 'cash control account is inactive or invalid';
  END IF;
  PERFORM 1 FROM public.accounts
  WHERE id = v_control.ar_account_id AND org_id = v_invoice.org_id
    AND account_type = 'asset' AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AR control account is inactive or invalid'; END IF;

  SELECT id INTO v_period_id FROM public.accounting_periods
  WHERE org_id = v_invoice.org_id AND entity_id = v_invoice.entity_id
    AND p_receipt_date BETWEEN period_start AND period_end AND status = 'OPEN'
  FOR UPDATE;
  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'an OPEN accounting period is required for the customer receipt';
  END IF;

  PERFORM set_config('tapaano.accounting_write', 'trusted', true);
  PERFORM set_config('tapaano.customer_receipt_write', 'trusted', true);

  INSERT INTO public.accounting_events (
    org_id, entity_id, event_type, source_type, source_id, idempotency_key,
    payload_hash, actor_id
  ) VALUES (
    v_invoice.org_id, v_invoice.entity_id, 'customer_receipt_posted',
    'customer_receipt', v_receipt_id, p_idempotency_key, v_payload_hash, v_actor
  ) RETURNING id INTO v_event_id;

  INSERT INTO public.journal_entries (
    org_id, entity_id, entry_number, entry_date, memo, status, created_by,
    posted_at, source_module, accounting_period_id, accounting_event_id
  ) VALUES (
    v_invoice.org_id, v_invoice.entity_id,
    'RCPT-' || left(p_receipt_number, 36) || '-' || left(md5(p_idempotency_key), 8),
    p_receipt_date, 'Customer receipt ' || p_receipt_number || ': ' || p_reference,
    'posted', v_actor, now(), 'ar_receipt', v_period_id, v_event_id
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_lines (
    journal_entry_id, account_id, debit, credit, memo, org_id, entity_id, line_number
  ) VALUES
    (v_journal_id, v_control.cash_account_id, v_invoice.total, 0,
      'Manual customer receipt', v_invoice.org_id, v_invoice.entity_id, 1),
    (v_journal_id, v_control.ar_account_id, 0, v_invoice.total,
      'Accounts receivable settled', v_invoice.org_id, v_invoice.entity_id, 2);

  UPDATE public.accounting_events SET journal_entry_id = v_journal_id WHERE id = v_event_id;

  INSERT INTO public.customer_receipts (
    id, org_id, entity_id, customer_id, invoice_id, receipt_number,
    receipt_date, currency, amount, receipt_reference, account_control_id,
    accounting_event_id, journal_entry_id, idempotency_key, payload_hash,
    posted_by, posted_at
  ) VALUES (
    v_receipt_id, v_invoice.org_id, v_invoice.entity_id, v_invoice.customer_id,
    v_invoice.id, p_receipt_number, p_receipt_date, upper(v_invoice.currency),
    v_invoice.total, p_reference, v_control.id, v_event_id, v_journal_id,
    p_idempotency_key, v_payload_hash, v_actor, now()
  );

  PERFORM public.validate_customer_receipt_graph(v_receipt_id);
  RETURN v_receipt_id;
END;
$$;

DO $$
DECLARE
  receipt_record record;
BEGIN
  FOR receipt_record IN SELECT id FROM public.customer_receipts LOOP
    PERFORM public.validate_customer_receipt_graph(receipt_record.id);
  END LOOP;
END;
$$;

ALTER TABLE public.entity_customer_receipt_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_receipts ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  target_table text;
  policy_record record;
  column_record record;
  role_name text;
  function_record record;
  drop_kind text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'entity_customer_receipt_controls', 'customer_receipts'
  ] LOOP
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
    SELECT namespace.nspname, procedure_info.proname, procedure_info.prokind,
      pg_get_function_identity_arguments(procedure_info.oid) AS identity_arguments,
      oidvectortypes(procedure_info.proargtypes) AS argument_types
    FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid=procedure_info.pronamespace
    WHERE namespace.nspname='public'
      AND procedure_info.proname IN (
        'configure_entity_customer_receipt_accounts', 'post_customer_receipt'
      )
  LOOP
    IF (function_record.proname='configure_entity_customer_receipt_accounts'
        AND (function_record.prokind <> 'f'
          OR function_record.argument_types <> 'uuid, uuid, text'))
       OR (function_record.proname='post_customer_receipt'
        AND (function_record.prokind <> 'f'
          OR function_record.argument_types <> 'uuid, text, date, text, text, text')) THEN
      drop_kind := CASE WHEN function_record.prokind='p' THEN 'PROCEDURE' ELSE 'FUNCTION' END;
      EXECUTE format('DROP %s %I.%I(%s)', drop_kind, function_record.nspname,
        function_record.proname, function_record.identity_arguments);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_customer_receipt_graph(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.configure_entity_customer_receipt_accounts(uuid, uuid, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.post_customer_receipt(uuid, text, date, text, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.configure_entity_customer_receipt_accounts(uuid, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_customer_receipt(uuid, text, date, text, text, text)
  TO authenticated;

COMMIT;
