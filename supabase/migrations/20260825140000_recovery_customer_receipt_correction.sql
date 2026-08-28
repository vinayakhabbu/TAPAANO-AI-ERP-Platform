-- Controlled correction of a verified manual customer receipt. PostgreSQL
-- copies the immutable receipt journal into one exact-offset entry in an OPEN
-- period. The original receipt and invoice remain unchanged. This is an
-- accounting correction, not evidence of a refund or bank action.

BEGIN;

LOCK TABLE public.customer_receipts, public.accounting_events,
  public.accounting_periods, public.journal_entries, public.journal_lines
  IN SHARE ROW EXCLUSIVE MODE;

CREATE UNIQUE INDEX IF NOT EXISTS customer_receipts_org_entity_customer_id_uidx
  ON public.customer_receipts (org_id, entity_id, customer_id, id);

CREATE TABLE IF NOT EXISTS public.customer_receipt_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  original_receipt_id uuid NOT NULL,
  correction_number text NOT NULL,
  correction_date date NOT NULL,
  currency text NOT NULL,
  amount numeric(15,2) NOT NULL,
  reason text NOT NULL,
  accounting_event_id uuid NOT NULL REFERENCES public.accounting_events(id),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id),
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  posted_by uuid NOT NULL REFERENCES auth.users(id),
  posted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customer_receipt_corrections_number_check CHECK (
    correction_number = btrim(correction_number)
    AND length(correction_number) BETWEEN 1 AND 80
    AND correction_number !~ '[[:cntrl:]]'
  ),
  CONSTRAINT customer_receipt_corrections_reason_check CHECK (
    reason = btrim(reason)
    AND length(reason) BETWEEN 1 AND 240
    AND reason !~ '[[:cntrl:]]'
  ),
  CONSTRAINT customer_receipt_corrections_currency_check
    CHECK (currency ~ '^[A-Z]{3}$'),
  CONSTRAINT customer_receipt_corrections_amount_check CHECK (
    amount::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND amount > 0 AND round(amount, 2) = amount
  ),
  CONSTRAINT customer_receipt_corrections_key_check CHECK (
    idempotency_key = btrim(idempotency_key)
    AND length(idempotency_key) BETWEEN 1 AND 160
    AND idempotency_key !~ '[[:cntrl:]]'
    AND payload_hash ~ '^[0-9a-f]{32}$'
  ),
  CONSTRAINT customer_receipt_corrections_receipt_fkey
    FOREIGN KEY (org_id, entity_id, customer_id, original_receipt_id)
    REFERENCES public.customer_receipts(org_id, entity_id, customer_id, id),
  UNIQUE (org_id, correction_number),
  UNIQUE (org_id, idempotency_key),
  UNIQUE (original_receipt_id),
  UNIQUE (accounting_event_id),
  UNIQUE (journal_entry_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS customer_receipt_corrections_org_entity_id_uidx
  ON public.customer_receipt_corrections (org_id, entity_id, id);

LOCK TABLE public.customer_receipt_corrections IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.accounting_events
  DROP CONSTRAINT IF EXISTS accounting_events_type_check;
ALTER TABLE public.accounting_events
  ADD CONSTRAINT accounting_events_type_check CHECK (
    event_type IN (
      'manual_journal_posted', 'journal_reversed', 'customer_invoice_posted',
      'customer_credit_note_posted', 'customer_receipt_posted',
      'supplier_bill_posted', 'supplier_bill_credit_posted',
      'supplier_payment_posted', 'customer_receipt_corrected'
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
      'customer_receipt_correction'
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
      'supplier_payment', 'customer_receipt_correction'
    ) AND source_id IS NOT NULL)
  );

CREATE OR REPLACE FUNCTION public.guard_customer_receipt_correction_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('tapaano.customer_receipt_correction_write', true)
       IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'customer receipt correction is immutable; use the trusted correction workflow';
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
    ELSIF OLD.source_type = 'customer_receipt'
       AND current_setting('tapaano.customer_receipt_write', true) IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'customer receipt accounting event is immutable';
    ELSIF OLD.source_type = 'customer_receipt_correction'
       AND current_setting('tapaano.customer_receipt_correction_write', true)
         IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'customer receipt correction accounting event is immutable';
    ELSIF OLD.source_type = 'supplier_bill'
       AND current_setting('tapaano.supplier_bill_write', true) IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'supplier bill accounting event is immutable';
    ELSIF OLD.source_type = 'supplier_bill_credit'
       AND current_setting('tapaano.supplier_bill_credit_write', true) IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'supplier credit accounting event is immutable';
    ELSIF OLD.source_type = 'supplier_payment'
       AND current_setting('tapaano.supplier_payment_write', true) IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'supplier payment accounting event is immutable';
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
      ELSIF v_source_type = 'customer_receipt'
         AND current_setting('tapaano.customer_receipt_correction_write', true)
           IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'customer receipt reversal requires the trusted receipt-correction workflow';
      ELSIF v_source_type = 'customer_receipt_correction' THEN
        RAISE EXCEPTION 'customer receipt correction reversal is unavailable';
      ELSIF v_source_type = 'supplier_bill'
         AND current_setting('tapaano.supplier_bill_credit_write', true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'supplier bill reversal requires the trusted vendor-credit workflow';
      ELSIF v_source_type = 'supplier_bill_credit' THEN
        RAISE EXCEPTION 'supplier credit reversal is unavailable';
      ELSIF v_source_type = 'supplier_payment' THEN
        RAISE EXCEPTION 'supplier payment reversal is unavailable';
      END IF;
    ELSIF TG_OP IN ('UPDATE', 'DELETE') THEN
      SELECT source_type INTO v_source_type
      FROM public.accounting_events WHERE id = OLD.accounting_event_id;
      IF v_source_type = 'customer_invoice'
         AND current_setting('tapaano.invoice_write', true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'invoice journal is immutable';
      ELSIF v_source_type = 'customer_credit_note'
         AND current_setting('tapaano.invoice_credit_write', true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'customer credit-note journal is immutable';
      ELSIF v_source_type = 'customer_receipt'
         AND current_setting('tapaano.customer_receipt_write', true) IS DISTINCT FROM 'trusted'
         AND current_setting('tapaano.customer_receipt_correction_write', true)
           IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'customer receipt journal is immutable';
      ELSIF v_source_type = 'customer_receipt_correction'
         AND current_setting('tapaano.customer_receipt_correction_write', true)
           IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'customer receipt correction journal is immutable';
      ELSIF v_source_type = 'supplier_bill'
         AND current_setting('tapaano.supplier_bill_write', true) IS DISTINCT FROM 'trusted'
         AND current_setting('tapaano.supplier_bill_credit_write', true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'supplier bill journal is immutable';
      ELSIF v_source_type = 'supplier_bill_credit'
         AND current_setting('tapaano.supplier_bill_credit_write', true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'supplier credit journal is immutable';
      ELSIF v_source_type = 'supplier_payment'
         AND current_setting('tapaano.supplier_payment_write', true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'supplier payment journal is immutable';
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
  v_correction_journal_id uuid;
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
     OR EXISTS (SELECT 1 FROM public.customer_credit_notes
       WHERE original_invoice_id = v_invoice.id) THEN
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
  IF NOT FOUND OR v_event.org_id IS DISTINCT FROM v_receipt.org_id
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
  IF NOT FOUND OR v_journal.org_id IS DISTINCT FROM v_receipt.org_id
     OR v_journal.entity_id IS DISTINCT FROM v_receipt.entity_id
     OR v_journal.status::text IS DISTINCT FROM 'posted'
     OR v_journal.source_module IS DISTINCT FROM 'ar_receipt'
     OR v_journal.entry_date IS DISTINCT FROM v_receipt.receipt_date
     OR v_journal.accounting_event_id IS DISTINCT FROM v_receipt.accounting_event_id
     OR v_journal.created_by IS DISTINCT FROM v_receipt.posted_by
     OR v_journal.accounting_period_id IS NULL
     OR v_journal.reversal_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'customer receipt journal graph is invalid';
  END IF;
  SELECT journal_entry_id INTO v_correction_journal_id
  FROM public.customer_receipt_corrections
  WHERE original_receipt_id = v_receipt.id;
  IF v_journal.reversed_by_id IS DISTINCT FROM v_correction_journal_id THEN
    RAISE EXCEPTION 'customer receipt correction lineage is invalid';
  END IF;
  SELECT * INTO v_period FROM public.accounting_periods WHERE id = v_journal.accounting_period_id;
  IF v_period.id IS NULL OR v_period.org_id IS DISTINCT FROM v_receipt.org_id
     OR v_period.entity_id IS DISTINCT FROM v_receipt.entity_id
     OR v_receipt.receipt_date NOT BETWEEN v_period.period_start AND v_period.period_end THEN
    RAISE EXCEPTION 'customer receipt period graph is invalid';
  END IF;
  SELECT count(*), COALESCE(sum(debit), 0), COALESCE(sum(credit), 0),
    count(*) FILTER (WHERE account_id = v_control.cash_account_id
      AND debit = v_receipt.amount AND credit = 0),
    count(*) FILTER (WHERE account_id = v_control.ar_account_id
      AND credit = v_receipt.amount AND debit = 0)
  INTO v_line_count, v_debit, v_credit, v_cash_lines, v_ar_lines
  FROM public.journal_lines WHERE journal_entry_id = v_journal.id;
  IF v_line_count IS DISTINCT FROM 2
     OR v_debit IS DISTINCT FROM v_receipt.amount
     OR v_credit IS DISTINCT FROM v_receipt.amount
     OR v_cash_lines IS DISTINCT FROM 1 OR v_ar_lines IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'customer receipt journal lines do not reconcile';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_customer_receipt_correction_graph(
  p_correction_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
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
  SELECT * INTO v_correction FROM public.customer_receipt_corrections
  WHERE id = p_correction_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_correction.correction_number IS NULL
     OR v_correction.correction_number IS DISTINCT FROM btrim(v_correction.correction_number)
     OR length(v_correction.correction_number) NOT BETWEEN 1 AND 80
     OR v_correction.correction_number ~ '[[:cntrl:]]'
     OR v_correction.correction_date IS NULL
     OR v_correction.currency !~ '^[A-Z]{3}$'
     OR v_correction.amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_correction.amount <= 0
     OR round(v_correction.amount, 2) IS DISTINCT FROM v_correction.amount
     OR v_correction.reason IS NULL
     OR v_correction.reason IS DISTINCT FROM btrim(v_correction.reason)
     OR length(v_correction.reason) NOT BETWEEN 1 AND 240
     OR v_correction.reason ~ '[[:cntrl:]]'
     OR v_correction.accounting_event_id IS NULL
     OR v_correction.journal_entry_id IS NULL
     OR v_correction.posted_by IS NULL OR v_correction.posted_at IS NULL THEN
    RAISE EXCEPTION 'customer receipt correction header is not canonical';
  END IF;
  SELECT * INTO v_receipt FROM public.customer_receipts
  WHERE id = v_correction.original_receipt_id;
  IF NOT FOUND OR v_receipt.org_id IS DISTINCT FROM v_correction.org_id
     OR v_receipt.entity_id IS DISTINCT FROM v_correction.entity_id
     OR v_receipt.customer_id IS DISTINCT FROM v_correction.customer_id
     OR v_receipt.currency IS DISTINCT FROM v_correction.currency
     OR v_receipt.amount IS DISTINCT FROM v_correction.amount
     OR v_correction.correction_date < v_receipt.receipt_date THEN
    RAISE EXCEPTION 'customer receipt correction source graph is invalid';
  END IF;
  PERFORM public.validate_customer_receipt_graph(v_receipt.id);
  SELECT * INTO v_event FROM public.accounting_events
  WHERE id = v_correction.accounting_event_id;
  IF NOT FOUND OR v_event.org_id IS DISTINCT FROM v_correction.org_id
     OR v_event.entity_id IS DISTINCT FROM v_correction.entity_id
     OR v_event.event_type IS DISTINCT FROM 'customer_receipt_corrected'
     OR v_event.source_type IS DISTINCT FROM 'customer_receipt_correction'
     OR v_event.source_id IS DISTINCT FROM v_correction.id
     OR v_event.journal_entry_id IS DISTINCT FROM v_correction.journal_entry_id
     OR v_event.idempotency_key IS DISTINCT FROM v_correction.idempotency_key
     OR v_event.payload_hash IS DISTINCT FROM v_correction.payload_hash
     OR v_event.actor_id IS DISTINCT FROM v_correction.posted_by THEN
    RAISE EXCEPTION 'customer receipt correction event graph is invalid';
  END IF;
  SELECT * INTO v_journal FROM public.journal_entries
  WHERE id = v_correction.journal_entry_id;
  SELECT * INTO v_original_journal FROM public.journal_entries
  WHERE id = v_receipt.journal_entry_id;
  IF v_journal.id IS NULL OR v_original_journal.id IS NULL
     OR v_journal.org_id IS DISTINCT FROM v_correction.org_id
     OR v_journal.entity_id IS DISTINCT FROM v_correction.entity_id
     OR v_journal.status::text IS DISTINCT FROM 'posted'
     OR v_journal.source_module IS DISTINCT FROM 'ar_receipt_correction'
     OR v_journal.entry_date IS DISTINCT FROM v_correction.correction_date
     OR v_journal.accounting_event_id IS DISTINCT FROM v_correction.accounting_event_id
     OR v_journal.created_by IS DISTINCT FROM v_correction.posted_by
     OR v_journal.accounting_period_id IS NULL
     OR v_journal.reversal_of_id IS DISTINCT FROM v_original_journal.id
     OR v_journal.reversed_by_id IS NOT NULL
     OR v_original_journal.reversed_by_id IS DISTINCT FROM v_journal.id THEN
    RAISE EXCEPTION 'customer receipt correction journal graph is invalid';
  END IF;
  SELECT * INTO v_period FROM public.accounting_periods
  WHERE id = v_journal.accounting_period_id;
  IF v_period.id IS NULL OR v_period.org_id IS DISTINCT FROM v_correction.org_id
     OR v_period.entity_id IS DISTINCT FROM v_correction.entity_id
     OR v_correction.correction_date NOT BETWEEN v_period.period_start AND v_period.period_end THEN
    RAISE EXCEPTION 'customer receipt correction period graph is invalid';
  END IF;
  SELECT count(*), COALESCE(sum(debit), 0), COALESCE(sum(credit), 0)
  INTO v_line_count, v_debit, v_credit
  FROM public.journal_lines WHERE journal_entry_id = v_journal.id;
  IF v_line_count IS DISTINCT FROM 2
     OR v_debit IS DISTINCT FROM v_correction.amount
     OR v_credit IS DISTINCT FROM v_correction.amount
     OR EXISTS (
       SELECT 1 FROM public.journal_lines original_line
       LEFT JOIN public.journal_lines offset_line
         ON offset_line.journal_entry_id = v_journal.id
        AND offset_line.line_number = original_line.line_number
       WHERE original_line.journal_entry_id = v_original_journal.id
         AND (offset_line.id IS NULL
           OR offset_line.account_id IS DISTINCT FROM original_line.account_id
           OR offset_line.debit IS DISTINCT FROM original_line.credit
           OR offset_line.credit IS DISTINCT FROM original_line.debit)
     ) THEN
    RAISE EXCEPTION 'customer receipt correction journal lines are not an exact offset';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_customer_receipt_correction_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_correction_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN v_correction_id := OLD.id; ELSE v_correction_id := NEW.id; END IF;
  PERFORM public.validate_customer_receipt_correction_graph(v_correction_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS guard_customer_receipt_correction_write
  ON public.customer_receipt_corrections;
CREATE TRIGGER guard_customer_receipt_correction_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.customer_receipt_corrections
  FOR EACH ROW EXECUTE FUNCTION public.guard_customer_receipt_correction_write();
DROP TRIGGER IF EXISTS guard_customer_receipt_correction_truncate
  ON public.customer_receipt_corrections;
CREATE TRIGGER guard_customer_receipt_correction_truncate
  BEFORE TRUNCATE ON public.customer_receipt_corrections
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_customer_receipt_correction_write();
DROP TRIGGER IF EXISTS validate_customer_receipt_correction_deferred
  ON public.customer_receipt_corrections;
CREATE CONSTRAINT TRIGGER validate_customer_receipt_correction_deferred
  AFTER INSERT OR UPDATE OR DELETE ON public.customer_receipt_corrections
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_customer_receipt_correction_trigger();

DROP TRIGGER IF EXISTS guard_invoice_events_graph ON public.accounting_events;
CREATE TRIGGER guard_invoice_events_graph
  BEFORE UPDATE OR DELETE ON public.accounting_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_accounting_graph();
DROP TRIGGER IF EXISTS guard_invoice_journals_graph ON public.journal_entries;
CREATE TRIGGER guard_invoice_journals_graph
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_accounting_graph();

CREATE OR REPLACE FUNCTION public.post_customer_receipt_correction(
  p_receipt_id uuid,
  p_correction_number text,
  p_correction_date date,
  p_reason text,
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
  v_receipt public.customer_receipts%ROWTYPE;
  v_original_journal public.journal_entries%ROWTYPE;
  v_period_id uuid;
  v_correction_id uuid := gen_random_uuid();
  v_event_id uuid;
  v_journal_id uuid;
  v_existing_id uuid;
  v_existing_receipt_id uuid;
  v_existing_hash text;
  v_payload_hash text;
BEGIN
  v_actor_org := public.get_user_org_id();
  IF v_actor_org IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor := public.assert_accounting_actor(v_actor_org);
  IF p_correction_number IS NULL
     OR p_correction_number IS DISTINCT FROM btrim(p_correction_number)
     OR length(p_correction_number) NOT BETWEEN 1 AND 80
     OR p_correction_number ~ '[[:cntrl:]]'
     OR p_correction_date IS NULL
     OR p_reason IS NULL OR p_reason IS DISTINCT FROM btrim(p_reason)
     OR length(p_reason) NOT BETWEEN 1 AND 240 OR p_reason ~ '[[:cntrl:]]'
     OR p_idempotency_key IS NULL
     OR p_idempotency_key IS DISTINCT FROM btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 160
     OR p_idempotency_key ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid customer receipt correction request';
  END IF;
  v_payload_hash := md5(jsonb_build_object(
    'receipt_id', p_receipt_id,
    'correction_number', p_correction_number,
    'correction_date', p_correction_date,
    'reason', p_reason
  )::text);
  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.accounting_events IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.customer_receipts IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.customer_receipt_corrections IN SHARE ROW EXCLUSIVE MODE;
  SELECT id, original_receipt_id, payload_hash
  INTO v_existing_id, v_existing_receipt_id, v_existing_hash
  FROM public.customer_receipt_corrections
  WHERE org_id = v_actor_org AND idempotency_key = p_idempotency_key;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_receipt_id IS DISTINCT FROM p_receipt_id
       OR v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'customer receipt correction idempotency key conflicts with another payload';
    END IF;
    PERFORM public.validate_customer_receipt_correction_graph(v_existing_id);
    RETURN v_existing_id;
  END IF;
  SELECT * INTO v_receipt FROM public.customer_receipts
  WHERE id = p_receipt_id AND org_id = v_actor_org FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'posted customer receipt not found or unavailable';
  END IF;
  PERFORM public.validate_customer_receipt_graph(v_receipt.id);
  SELECT * INTO v_original_journal FROM public.journal_entries
  WHERE id = v_receipt.journal_entry_id AND org_id = v_actor_org FOR UPDATE;
  IF v_original_journal.id IS NULL OR v_original_journal.status::text IS DISTINCT FROM 'posted'
     OR v_original_journal.reversal_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'customer receipt journal is not correctable';
  END IF;
  IF EXISTS (SELECT 1 FROM public.customer_receipt_corrections
    WHERE original_receipt_id = v_receipt.id)
     OR v_original_journal.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'customer receipt already has a correction';
  END IF;
  IF p_correction_date < v_receipt.receipt_date THEN
    RAISE EXCEPTION 'customer receipt correction date cannot precede the receipt date';
  END IF;
  SELECT id INTO v_period_id FROM public.accounting_periods
  WHERE org_id = v_receipt.org_id AND entity_id = v_receipt.entity_id
    AND p_correction_date BETWEEN period_start AND period_end AND status = 'OPEN'
  FOR UPDATE;
  IF v_period_id IS NULL THEN
    RAISE EXCEPTION 'an OPEN accounting period is required for the customer receipt correction';
  END IF;
  PERFORM set_config('tapaano.accounting_write', 'trusted', true);
  PERFORM set_config('tapaano.customer_receipt_correction_write', 'trusted', true);
  INSERT INTO public.accounting_events (
    org_id, entity_id, event_type, source_type, source_id, idempotency_key,
    payload_hash, actor_id
  ) VALUES (
    v_receipt.org_id, v_receipt.entity_id, 'customer_receipt_corrected',
    'customer_receipt_correction', v_correction_id, p_idempotency_key,
    v_payload_hash, v_actor
  ) RETURNING id INTO v_event_id;
  INSERT INTO public.journal_entries (
    org_id, entity_id, entry_number, entry_date, memo, status, created_by,
    posted_at, source_module, accounting_period_id, accounting_event_id,
    reversal_of_id
  ) VALUES (
    v_receipt.org_id, v_receipt.entity_id,
    'RCC-' || left(p_correction_number, 36) || '-' || left(md5(p_idempotency_key), 8),
    p_correction_date, 'Customer receipt correction ' || p_correction_number || ': ' || p_reason,
    'posted', v_actor, now(), 'ar_receipt_correction', v_period_id, v_event_id,
    v_original_journal.id
  ) RETURNING id INTO v_journal_id;
  INSERT INTO public.journal_lines (
    journal_entry_id, account_id, debit, credit, memo, org_id, entity_id, line_number
  )
  SELECT v_journal_id, account_id, credit, debit,
    'Receipt correction: ' || COALESCE(memo, 'exact offset'),
    org_id, entity_id, line_number
  FROM public.journal_lines
  WHERE journal_entry_id = v_original_journal.id
  ORDER BY line_number;
  INSERT INTO public.customer_receipt_corrections (
    id, org_id, entity_id, customer_id, original_receipt_id,
    correction_number, correction_date, currency, amount, reason,
    accounting_event_id, journal_entry_id, idempotency_key, payload_hash,
    posted_by, posted_at
  ) VALUES (
    v_correction_id, v_receipt.org_id, v_receipt.entity_id, v_receipt.customer_id,
    v_receipt.id, p_correction_number, p_correction_date, v_receipt.currency,
    v_receipt.amount, p_reason, v_event_id, v_journal_id, p_idempotency_key,
    v_payload_hash, v_actor, now()
  );
  UPDATE public.accounting_events SET journal_entry_id = v_journal_id
  WHERE id = v_event_id;
  UPDATE public.journal_entries SET reversed_by_id = v_journal_id
  WHERE id = v_original_journal.id;
  PERFORM public.validate_customer_receipt_graph(v_receipt.id);
  PERFORM public.validate_customer_receipt_correction_graph(v_correction_id);
  RETURN v_correction_id;
END;
$$;

DO $$
DECLARE
  receipt_record record;
  correction_record record;
BEGIN
  FOR receipt_record IN SELECT id FROM public.customer_receipts LOOP
    PERFORM public.validate_customer_receipt_graph(receipt_record.id);
  END LOOP;
  FOR correction_record IN SELECT id FROM public.customer_receipt_corrections LOOP
    PERFORM public.validate_customer_receipt_correction_graph(correction_record.id);
  END LOOP;
END;
$$;

ALTER TABLE public.customer_receipt_corrections ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_record record;
  column_record record;
  role_name text;
  routine record;
  drop_kind text;
BEGIN
  FOR policy_record IN SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'customer_receipt_corrections'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.customer_receipt_corrections',
      policy_record.policyname);
  END LOOP;
  CREATE POLICY customer_receipt_corrections_tenant_read
    ON public.customer_receipt_corrections FOR SELECT TO authenticated
    USING (org_id = public.get_user_org_id());
  REVOKE ALL ON TABLE public.customer_receipt_corrections
    FROM PUBLIC, anon, authenticated, service_role;
  FOR column_record IN SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customer_receipt_corrections'
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.customer_receipt_corrections FROM PUBLIC',
      column_record.column_name);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role'] LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.customer_receipt_corrections FROM %I',
        column_record.column_name, role_name);
    END LOOP;
  END LOOP;
  GRANT SELECT ON TABLE public.customer_receipt_corrections TO authenticated;
  IF EXISTS (SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public'
      AND tablename = 'customer_receipt_corrections') THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.customer_receipt_corrections;
  END IF;
  FOR routine IN SELECT namespace.nspname, procedure_info.proname,
      procedure_info.prokind,
      pg_get_function_identity_arguments(procedure_info.oid) AS args,
      oidvectortypes(procedure_info.proargtypes) AS types
    FROM pg_proc procedure_info
    JOIN pg_namespace namespace ON namespace.oid = procedure_info.pronamespace
    WHERE namespace.nspname = 'public'
      AND procedure_info.proname = 'post_customer_receipt_correction'
  LOOP
    IF routine.prokind <> 'f' OR routine.types <> 'uuid, text, date, text, text' THEN
      drop_kind := CASE WHEN routine.prokind = 'p' THEN 'PROCEDURE' ELSE 'FUNCTION' END;
      EXECUTE format('DROP %s %I.%I(%s)', drop_kind, routine.nspname,
        routine.proname, routine.args);
    END IF;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_customer_receipt_correction_graph(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.post_customer_receipt_correction(uuid, text, date, text, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.post_customer_receipt_correction(uuid, text, date, text, text)
  TO authenticated;

COMMIT;
