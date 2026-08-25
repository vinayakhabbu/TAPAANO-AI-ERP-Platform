-- Recovery Cycle 21: first controlled customer-invoice posting vertical slice.
-- Supported boundary: zero tax, entity functional currency, one immutable AR
-- control account and one immutable revenue account. Credit notes, tax, FX,
-- settlement, and legacy invoice promotion remain unavailable.

BEGIN;

LOCK TABLE public.entities, public.customers, public.accounts, public.invoices,
  public.accounting_events, public.journal_entries, public.journal_lines
  IN SHARE ROW EXCLUSIVE MODE;

CREATE UNIQUE INDEX IF NOT EXISTS customers_org_id_id_uidx
  ON public.customers (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_id_entity_id_id_uidx
  ON public.invoices (org_id, entity_id, id);

CREATE TABLE IF NOT EXISTS public.entity_invoice_account_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  ar_account_id uuid NOT NULL,
  revenue_account_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  configured_by uuid NOT NULL REFERENCES auth.users(id),
  configured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_invoice_controls_accounts_distinct_check
    CHECK (ar_account_id <> revenue_account_id),
  CONSTRAINT entity_invoice_controls_key_check CHECK (btrim(idempotency_key) <> ''),
  CONSTRAINT entity_invoice_controls_org_entity_fkey
    FOREIGN KEY (org_id, entity_id) REFERENCES public.entities(org_id, id),
  CONSTRAINT entity_invoice_controls_org_ar_account_fkey
    FOREIGN KEY (org_id, ar_account_id) REFERENCES public.accounts(org_id, id),
  CONSTRAINT entity_invoice_controls_org_revenue_account_fkey
    FOREIGN KEY (org_id, revenue_account_id) REFERENCES public.accounts(org_id, id),
  UNIQUE (org_id, entity_id),
  UNIQUE (org_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_invoice_controls_org_id_id_uidx
  ON public.entity_invoice_account_controls (org_id, id);

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS accounting_status text NOT NULL DEFAULT 'UNVERIFIED_LEGACY',
  ADD COLUMN IF NOT EXISTS account_control_id uuid,
  ADD COLUMN IF NOT EXISTS accounting_event_id uuid,
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by uuid;

CREATE TABLE IF NOT EXISTS public.invoice_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  line_number integer NOT NULL,
  description text NOT NULL,
  quantity numeric(18,4) NOT NULL,
  unit_price numeric(18,4) NOT NULL,
  line_total numeric(15,2) NOT NULL,
  revenue_account_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invoice_lines_number_check CHECK (line_number > 0),
  CONSTRAINT invoice_lines_description_check CHECK (btrim(description) <> ''),
  CONSTRAINT invoice_lines_value_check CHECK (
    quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND line_total::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND quantity > 0 AND unit_price > 0 AND line_total > 0
    AND round(quantity, 4) = quantity
    AND round(unit_price, 4) = unit_price
    AND round(quantity * unit_price, 2) = line_total
  ),
  CONSTRAINT invoice_lines_org_invoice_fkey
    FOREIGN KEY (org_id, entity_id, invoice_id)
    REFERENCES public.invoices(org_id, entity_id, id),
  CONSTRAINT invoice_lines_org_revenue_account_fkey
    FOREIGN KEY (org_id, revenue_account_id) REFERENCES public.accounts(org_id, id),
  UNIQUE (invoice_id, line_number)
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.invoices invoice
    LEFT JOIN public.entities entity ON entity.id = invoice.entity_id
    LEFT JOIN public.customers customer ON customer.id = invoice.customer_id
    WHERE entity.id IS NULL OR customer.id IS NULL
       OR entity.org_id IS DISTINCT FROM invoice.org_id
       OR customer.org_id IS DISTINCT FROM invoice.org_id
  ) THEN
    RAISE EXCEPTION 'customer invoice recovery preflight: dangling or cross-tenant legacy invoice';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.invoices
    WHERE accounting_status NOT IN ('UNVERIFIED_LEGACY', 'POSTED')
       OR subtotal::text IN ('NaN', 'Infinity', '-Infinity')
       OR tax::text IN ('NaN', 'Infinity', '-Infinity')
       OR total::text IN ('NaN', 'Infinity', '-Infinity')
       OR amount_paid::text IN ('NaN', 'Infinity', '-Infinity')
  ) THEN
    RAISE EXCEPTION 'customer invoice recovery preflight: invalid invoice values';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.entity_invoice_account_controls control
    JOIN public.accounts ar_account ON ar_account.id = control.ar_account_id
    JOIN public.accounts revenue_account ON revenue_account.id = control.revenue_account_id
    WHERE ar_account.org_id IS DISTINCT FROM control.org_id
       OR revenue_account.org_id IS DISTINCT FROM control.org_id
       OR ar_account.account_type <> 'asset'
       OR revenue_account.account_type <> 'revenue'
  ) THEN
    RAISE EXCEPTION 'customer invoice recovery preflight: invalid invoice account control';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_accounting_status_check') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_accounting_status_check
      CHECK (accounting_status IN ('UNVERIFIED_LEGACY', 'POSTED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_org_entity_fkey') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_org_entity_fkey
      FOREIGN KEY (org_id, entity_id) REFERENCES public.entities(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_org_customer_fkey') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_org_customer_fkey
      FOREIGN KEY (org_id, customer_id) REFERENCES public.customers(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_account_control_id_fkey') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_account_control_id_fkey
      FOREIGN KEY (org_id, account_control_id)
      REFERENCES public.entity_invoice_account_controls(org_id, id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_accounting_event_id_fkey') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_accounting_event_id_fkey
      FOREIGN KEY (accounting_event_id) REFERENCES public.accounting_events(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_journal_entry_id_fkey') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_journal_entry_id_fkey
      FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_posted_by_fkey') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_posted_by_fkey
      FOREIGN KEY (posted_by) REFERENCES auth.users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'accounting_events_source_shape_check') THEN
    ALTER TABLE public.accounting_events
      ADD CONSTRAINT accounting_events_source_shape_check CHECK (
        (source_type = 'manual_journal' AND source_id IS NULL)
        OR (source_type IN ('journal_reversal', 'customer_invoice') AND source_id IS NOT NULL)
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_invoice_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF current_setting('tapaano.invoice_write', true) IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'immutable: use the trusted customer-invoice workflow';
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
    END IF;
  ELSIF TG_TABLE_NAME = 'journal_entries' THEN
    IF TG_OP = 'INSERT' AND NEW.reversal_of_id IS NOT NULL THEN
      SELECT event.source_type INTO v_source_type
      FROM public.journal_entries original
      JOIN public.accounting_events event ON event.id = original.accounting_event_id
      WHERE original.id = NEW.reversal_of_id;
      IF v_source_type = 'customer_invoice'
         AND current_setting('tapaano.invoice_credit_write', true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'invoice journal reversal requires the future credit-note workflow';
      END IF;
    ELSIF TG_OP IN ('UPDATE', 'DELETE') THEN
      SELECT source_type INTO v_source_type
      FROM public.accounting_events WHERE id = OLD.accounting_event_id;
      IF v_source_type = 'customer_invoice'
         AND current_setting('tapaano.invoice_write', true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'invoice journal is immutable outside the customer-invoice workflow';
      END IF;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_customer_invoice_graph(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice public.invoices%ROWTYPE;
  v_control public.entity_invoice_account_controls%ROWTYPE;
  v_event public.accounting_events%ROWTYPE;
  v_journal public.journal_entries%ROWTYPE;
  v_entity_currency text;
  v_invoice_line_count integer;
  v_invoice_line_total numeric;
  v_journal_line_count integer;
  v_journal_debit numeric;
  v_journal_credit numeric;
  v_ar_lines integer;
  v_revenue_lines integer;
BEGIN
  SELECT * INTO v_invoice FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN; END IF;

  IF v_invoice.accounting_status = 'UNVERIFIED_LEGACY' THEN
    IF v_invoice.account_control_id IS NOT NULL
       OR v_invoice.accounting_event_id IS NOT NULL
       OR v_invoice.journal_entry_id IS NOT NULL
       OR v_invoice.posted_at IS NOT NULL
       OR v_invoice.posted_by IS NOT NULL THEN
      RAISE EXCEPTION 'unverified legacy invoice cannot claim accounting provenance';
    END IF;
    RETURN;
  END IF;

  IF v_invoice.accounting_status IS DISTINCT FROM 'POSTED'
     OR v_invoice.account_control_id IS NULL
     OR v_invoice.accounting_event_id IS NULL
     OR v_invoice.journal_entry_id IS NULL
     OR v_invoice.posted_at IS NULL
     OR v_invoice.posted_by IS NULL
     OR v_invoice.status::text IS DISTINCT FROM 'sent'
     OR v_invoice.issue_date IS NULL
     OR v_invoice.due_date IS NULL
     OR v_invoice.due_date < v_invoice.issue_date
     OR v_invoice.subtotal::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_invoice.tax::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_invoice.total::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_invoice.functional_total::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_invoice.amount_paid IS DISTINCT FROM 0
     OR v_invoice.tax IS DISTINCT FROM 0
     OR v_invoice.subtotal <= 0
     OR v_invoice.total IS DISTINCT FROM v_invoice.subtotal
     OR v_invoice.exchange_rate IS DISTINCT FROM 1
     OR v_invoice.functional_total IS DISTINCT FROM v_invoice.total THEN
    RAISE EXCEPTION 'posted customer invoice header is not canonical';
  END IF;

  SELECT currency INTO v_entity_currency
  FROM public.entities WHERE id = v_invoice.entity_id AND org_id = v_invoice.org_id;
  IF upper(v_invoice.currency) IS DISTINCT FROM upper(v_entity_currency) THEN
    RAISE EXCEPTION 'posted customer invoice is not in entity functional currency';
  END IF;

  SELECT * INTO v_control FROM public.entity_invoice_account_controls
  WHERE id = v_invoice.account_control_id
    AND org_id = v_invoice.org_id AND entity_id = v_invoice.entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'posted customer invoice account control is invalid'; END IF;

  SELECT * INTO v_event FROM public.accounting_events WHERE id = v_invoice.accounting_event_id;
  IF NOT FOUND
     OR v_event.org_id IS DISTINCT FROM v_invoice.org_id
     OR v_event.entity_id IS DISTINCT FROM v_invoice.entity_id
     OR v_event.event_type IS DISTINCT FROM 'customer_invoice_posted'
     OR v_event.source_type IS DISTINCT FROM 'customer_invoice'
     OR v_event.source_id IS DISTINCT FROM v_invoice.id
     OR v_event.journal_entry_id IS DISTINCT FROM v_invoice.journal_entry_id
     OR v_event.actor_id IS DISTINCT FROM v_invoice.posted_by THEN
    RAISE EXCEPTION 'posted customer invoice event graph is invalid';
  END IF;

  SELECT * INTO v_journal FROM public.journal_entries WHERE id = v_invoice.journal_entry_id;
  IF NOT FOUND
     OR v_journal.org_id IS DISTINCT FROM v_invoice.org_id
     OR v_journal.entity_id IS DISTINCT FROM v_invoice.entity_id
     OR v_journal.status::text IS DISTINCT FROM 'posted'
     OR v_journal.source_module IS DISTINCT FROM 'ar'
     OR v_journal.entry_date IS DISTINCT FROM v_invoice.issue_date
     OR v_journal.accounting_event_id IS DISTINCT FROM v_invoice.accounting_event_id
     OR v_journal.created_by IS DISTINCT FROM v_invoice.posted_by
     OR v_journal.accounting_period_id IS NULL THEN
    RAISE EXCEPTION 'posted customer invoice journal graph is invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.accounting_periods period
    WHERE period.id = v_journal.accounting_period_id
      AND period.org_id = v_invoice.org_id
      AND period.entity_id = v_invoice.entity_id
      AND v_invoice.issue_date BETWEEN period.period_start AND period.period_end
  ) THEN
    RAISE EXCEPTION 'posted customer invoice period graph is invalid';
  END IF;

  SELECT count(*), COALESCE(sum(line_total), 0)
  INTO v_invoice_line_count, v_invoice_line_total
  FROM public.invoice_lines
  WHERE invoice_id = v_invoice.id
    AND org_id = v_invoice.org_id
    AND entity_id = v_invoice.entity_id
    AND revenue_account_id = v_control.revenue_account_id;
  IF v_invoice_line_count < 1 OR v_invoice_line_total IS DISTINCT FROM v_invoice.subtotal THEN
    RAISE EXCEPTION 'posted customer invoice lines do not reconcile';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.invoice_lines
    WHERE invoice_id = v_invoice.id AND revenue_account_id <> v_control.revenue_account_id
  ) THEN
    RAISE EXCEPTION 'posted customer invoice uses an unauthorized revenue account';
  END IF;

  SELECT count(*), COALESCE(sum(debit), 0), COALESCE(sum(credit), 0),
         count(*) FILTER (
           WHERE account_id = v_control.ar_account_id
             AND debit = v_invoice.total AND credit = 0
         ),
         count(*) FILTER (
           WHERE account_id = v_control.revenue_account_id
             AND credit = v_invoice.total AND debit = 0
         )
  INTO v_journal_line_count, v_journal_debit, v_journal_credit, v_ar_lines, v_revenue_lines
  FROM public.journal_lines WHERE journal_entry_id = v_journal.id;
  IF v_journal_line_count IS DISTINCT FROM 2
     OR v_journal_debit IS DISTINCT FROM v_invoice.total
     OR v_journal_credit IS DISTINCT FROM v_invoice.total
     OR v_ar_lines IS DISTINCT FROM 1
     OR v_revenue_lines IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'posted customer invoice journal lines do not reconcile';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_customer_invoice_trigger()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'invoices' THEN
    IF TG_OP = 'DELETE' THEN v_invoice_id := OLD.id; ELSE v_invoice_id := NEW.id; END IF;
  ELSE
    IF TG_OP = 'DELETE' THEN v_invoice_id := OLD.invoice_id; ELSE v_invoice_id := NEW.invoice_id; END IF;
  END IF;
  PERFORM public.validate_customer_invoice_graph(v_invoice_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS guard_invoices_write ON public.invoices;
CREATE TRIGGER guard_invoices_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_write();
DROP TRIGGER IF EXISTS guard_invoices_truncate ON public.invoices;
CREATE TRIGGER guard_invoices_truncate
  BEFORE TRUNCATE ON public.invoices
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate();

DROP TRIGGER IF EXISTS guard_invoice_lines_write ON public.invoice_lines;
CREATE TRIGGER guard_invoice_lines_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.invoice_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_write();
DROP TRIGGER IF EXISTS guard_invoice_lines_truncate ON public.invoice_lines;
CREATE TRIGGER guard_invoice_lines_truncate
  BEFORE TRUNCATE ON public.invoice_lines
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate();

DROP TRIGGER IF EXISTS guard_entity_invoice_controls_write ON public.entity_invoice_account_controls;
CREATE TRIGGER guard_entity_invoice_controls_write
  BEFORE INSERT OR UPDATE OR DELETE ON public.entity_invoice_account_controls
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_write();
DROP TRIGGER IF EXISTS guard_entity_invoice_controls_truncate ON public.entity_invoice_account_controls;
CREATE TRIGGER guard_entity_invoice_controls_truncate
  BEFORE TRUNCATE ON public.entity_invoice_account_controls
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate();

DROP TRIGGER IF EXISTS guard_invoice_events_graph ON public.accounting_events;
CREATE TRIGGER guard_invoice_events_graph
  BEFORE UPDATE OR DELETE ON public.accounting_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_accounting_graph();
DROP TRIGGER IF EXISTS guard_invoice_journals_graph ON public.journal_entries;
CREATE TRIGGER guard_invoice_journals_graph
  BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_accounting_graph();

DROP TRIGGER IF EXISTS validate_customer_invoice_deferred ON public.invoices;
CREATE CONSTRAINT TRIGGER validate_customer_invoice_deferred
  AFTER INSERT OR UPDATE ON public.invoices
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_customer_invoice_trigger();
DROP TRIGGER IF EXISTS validate_customer_invoice_line_deferred ON public.invoice_lines;
CREATE CONSTRAINT TRIGGER validate_customer_invoice_line_deferred
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_lines
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.validate_customer_invoice_trigger();

CREATE OR REPLACE FUNCTION public.configure_entity_invoice_accounts(
  p_entity_id uuid,
  p_ar_account_id uuid,
  p_revenue_account_id uuid,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_org_id uuid;
  v_actor_org uuid;
  v_actor uuid;
  v_control public.entity_invoice_account_controls%ROWTYPE;
  v_ar_type public.account_type;
  v_revenue_type public.account_type;
BEGIN
  v_actor_org := public.get_user_org_id();
  IF v_actor_org IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor := public.assert_accounting_actor(v_actor_org);
  SELECT org_id INTO v_org_id FROM public.entities
  WHERE id = p_entity_id AND org_id = v_actor_org;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'entity not found or unavailable'; END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'invoice account control idempotency key is required';
  END IF;

  PERFORM set_config('tapaano.invoice_write', 'trusted', true);
  LOCK TABLE public.entity_invoice_account_controls IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_control FROM public.entity_invoice_account_controls
  WHERE org_id = v_org_id AND entity_id = p_entity_id;
  IF FOUND THEN
    IF v_control.ar_account_id IS DISTINCT FROM p_ar_account_id
       OR v_control.revenue_account_id IS DISTINCT FROM p_revenue_account_id
       OR v_control.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
      RAISE EXCEPTION 'entity invoice account control is immutable';
    END IF;
    RETURN v_control.id;
  END IF;

  SELECT account_type INTO v_ar_type FROM public.accounts
  WHERE id = p_ar_account_id AND org_id = v_org_id AND is_active = true FOR UPDATE;
  IF NOT FOUND OR v_ar_type <> 'asset' THEN
    RAISE EXCEPTION 'AR control must be an active asset account in the organization';
  END IF;
  SELECT account_type INTO v_revenue_type FROM public.accounts
  WHERE id = p_revenue_account_id AND org_id = v_org_id AND is_active = true FOR UPDATE;
  IF NOT FOUND OR v_revenue_type <> 'revenue' THEN
    RAISE EXCEPTION 'revenue control must be an active revenue account in the organization';
  END IF;

  INSERT INTO public.entity_invoice_account_controls (
    org_id, entity_id, ar_account_id, revenue_account_id,
    idempotency_key, configured_by
  ) VALUES (
    v_org_id, p_entity_id, p_ar_account_id, p_revenue_account_id,
    p_idempotency_key, v_actor
  ) RETURNING * INTO v_control;
  RETURN v_control.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_customer_invoice(
  p_entity_id uuid,
  p_customer_id uuid,
  p_invoice_number text,
  p_issue_date date,
  p_due_date date,
  p_currency text,
  p_tax numeric,
  p_notes text,
  p_lines jsonb,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_org_id uuid;
  v_functional_currency text;
  v_actor_org uuid;
  v_actor uuid;
  v_control public.entity_invoice_account_controls%ROWTYPE;
  v_period_id uuid;
  v_event_id uuid;
  v_existing_invoice_id uuid;
  v_existing_hash text;
  v_payload_hash text;
  v_invoice_id uuid := gen_random_uuid();
  v_journal_id uuid;
  v_line jsonb;
  v_description text;
  v_quantity numeric;
  v_unit_price numeric;
  v_line_total numeric;
  v_subtotal numeric := 0;
  v_line_number integer := 0;
BEGIN
  v_actor_org := public.get_user_org_id();
  IF v_actor_org IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor := public.assert_accounting_actor(v_actor_org);
  SELECT org_id, currency INTO v_org_id, v_functional_currency
  FROM public.entities WHERE id = p_entity_id AND org_id = v_actor_org;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'entity not found or unavailable'; END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'customer invoice idempotency key is required';
  END IF;
  v_payload_hash := md5(jsonb_build_object(
    'entity_id', p_entity_id, 'customer_id', p_customer_id,
    'invoice_number', btrim(p_invoice_number), 'issue_date', p_issue_date,
    'due_date', p_due_date, 'currency', upper(p_currency), 'tax', p_tax,
    'notes', p_notes, 'lines', p_lines
  )::text);

  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.accounting_events IN SHARE ROW EXCLUSIVE MODE;
  SELECT id, source_id, payload_hash
  INTO v_event_id, v_existing_invoice_id, v_existing_hash
  FROM public.accounting_events
  WHERE org_id = v_org_id AND source_type = 'customer_invoice'
    AND idempotency_key = p_idempotency_key;
  IF v_event_id IS NOT NULL THEN
    IF v_existing_invoice_id IS NULL OR v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'customer invoice idempotency key conflicts with another payload';
    END IF;
    PERFORM public.validate_customer_invoice_graph(v_existing_invoice_id);
    RETURN v_existing_invoice_id;
  END IF;

  IF p_invoice_number IS NULL OR btrim(p_invoice_number) = ''
     OR length(btrim(p_invoice_number)) > 80
     OR p_invoice_number IS DISTINCT FROM btrim(p_invoice_number)
     OR p_issue_date IS NULL OR p_due_date IS NULL OR p_due_date < p_issue_date THEN
    RAISE EXCEPTION 'invalid customer invoice header';
  END IF;
  IF p_tax IS NULL OR p_tax::text IN ('NaN', 'Infinity', '-Infinity') OR p_tax <> 0 THEN
    RAISE EXCEPTION 'only zero-tax customer invoices are supported';
  END IF;
  IF upper(p_currency) IS DISTINCT FROM upper(v_functional_currency) THEN
    RAISE EXCEPTION 'cross-currency invoice posting is unavailable; use entity functional currency';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) < 1 THEN
    RAISE EXCEPTION 'customer invoice requires at least one line';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.customers WHERE id = p_customer_id AND org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'customer is outside the organization';
  END IF;

  SELECT * INTO v_control FROM public.entity_invoice_account_controls
  WHERE org_id = v_org_id AND entity_id = p_entity_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'entity invoice account control is not configured'; END IF;

  PERFORM 1 FROM public.accounts
  WHERE id = v_control.ar_account_id AND org_id = v_org_id
    AND account_type = 'asset' AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AR control account is inactive or invalid'; END IF;
  PERFORM 1 FROM public.accounts
  WHERE id = v_control.revenue_account_id AND org_id = v_org_id
    AND account_type = 'revenue' AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'revenue control account is inactive or invalid'; END IF;

  SELECT id INTO v_period_id FROM public.accounting_periods
  WHERE org_id = v_org_id AND entity_id = p_entity_id
    AND p_issue_date BETWEEN period_start AND period_end AND status = 'OPEN'
  FOR UPDATE;
  IF v_period_id IS NULL THEN RAISE EXCEPTION 'an OPEN accounting period is required'; END IF;

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    BEGIN
      v_description := v_line->>'description';
      v_quantity := (v_line->>'quantity')::numeric;
      v_unit_price := (v_line->>'unit_price')::numeric;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid customer invoice line';
    END;
    IF v_description IS NULL OR btrim(v_description) = ''
       OR v_quantity::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_unit_price::text IN ('NaN', 'Infinity', '-Infinity')
       OR v_quantity <= 0 OR v_unit_price <= 0
       OR round(v_quantity, 4) IS DISTINCT FROM v_quantity
       OR round(v_unit_price, 4) IS DISTINCT FROM v_unit_price THEN
      RAISE EXCEPTION 'invalid customer invoice line';
    END IF;
    v_line_total := round(v_quantity * v_unit_price, 2);
    IF v_line_total <= 0 OR v_line_total::text IN ('NaN', 'Infinity', '-Infinity') THEN
      RAISE EXCEPTION 'invalid customer invoice line total';
    END IF;
    v_subtotal := v_subtotal + v_line_total;
  END LOOP;
  IF v_subtotal <= 0 OR round(v_subtotal, 2) IS DISTINCT FROM v_subtotal THEN
    RAISE EXCEPTION 'invalid customer invoice subtotal';
  END IF;

  PERFORM set_config('tapaano.accounting_write', 'trusted', true);
  PERFORM set_config('tapaano.invoice_write', 'trusted', true);
  INSERT INTO public.accounting_events (
    org_id, entity_id, event_type, source_type, source_id, idempotency_key,
    payload_hash, actor_id
  ) VALUES (
    v_org_id, p_entity_id, 'customer_invoice_posted', 'customer_invoice',
    v_invoice_id, p_idempotency_key, v_payload_hash, v_actor
  ) RETURNING id INTO v_event_id;

  INSERT INTO public.invoices (
    id, org_id, entity_id, customer_id, invoice_number, issue_date, due_date,
    subtotal, tax, total, amount_paid, status, notes, currency, exchange_rate,
    functional_total, accounting_status, account_control_id, posted_at, posted_by
  ) VALUES (
    v_invoice_id, v_org_id, p_entity_id, p_customer_id, p_invoice_number,
    p_issue_date, p_due_date, v_subtotal, 0, v_subtotal, 0, 'sent', p_notes,
    upper(v_functional_currency), 1, v_subtotal, 'POSTED', v_control.id, now(), v_actor
  );

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_number := v_line_number + 1;
    v_description := btrim(v_line->>'description');
    v_quantity := (v_line->>'quantity')::numeric;
    v_unit_price := (v_line->>'unit_price')::numeric;
    v_line_total := round(v_quantity * v_unit_price, 2);
    INSERT INTO public.invoice_lines (
      org_id, entity_id, invoice_id, line_number, description,
      quantity, unit_price, line_total, revenue_account_id
    ) VALUES (
      v_org_id, p_entity_id, v_invoice_id, v_line_number, v_description,
      v_quantity, v_unit_price, v_line_total, v_control.revenue_account_id
    );
  END LOOP;

  INSERT INTO public.journal_entries (
    org_id, entity_id, entry_number, entry_date, memo, status, created_by,
    posted_at, source_module, accounting_period_id, accounting_event_id
  ) VALUES (
    v_org_id, p_entity_id,
    'AR-' || left(p_invoice_number, 40) || '-' || left(md5(p_idempotency_key), 8),
    p_issue_date, 'Customer invoice ' || p_invoice_number, 'posted', v_actor,
    now(), 'ar', v_period_id, v_event_id
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_lines (
    journal_entry_id, account_id, debit, credit, memo,
    org_id, entity_id, line_number
  ) VALUES
    (v_journal_id, v_control.ar_account_id, v_subtotal, 0,
     'Accounts receivable', v_org_id, p_entity_id, 1),
    (v_journal_id, v_control.revenue_account_id, 0, v_subtotal,
     'Revenue', v_org_id, p_entity_id, 2);

  UPDATE public.accounting_events SET journal_entry_id = v_journal_id WHERE id = v_event_id;
  UPDATE public.invoices
  SET accounting_event_id = v_event_id, journal_entry_id = v_journal_id, updated_at = now()
  WHERE id = v_invoice_id;

  PERFORM public.validate_customer_invoice_graph(v_invoice_id);
  RETURN v_invoice_id;
END;
$$;

ALTER TABLE public.entity_invoice_account_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  policy_record record;
BEGIN
  FOR policy_record IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('invoices', 'invoice_lines', 'entity_invoice_account_controls')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      policy_record.policyname, policy_record.schemaname, policy_record.tablename);
  END LOOP;
END;
$$;

CREATE POLICY invoices_tenant_read ON public.invoices
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
CREATE POLICY invoice_lines_tenant_read ON public.invoice_lines
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());
CREATE POLICY entity_invoice_controls_tenant_read ON public.entity_invoice_account_controls
  FOR SELECT TO authenticated USING (org_id = public.get_user_org_id());

REVOKE ALL ON public.invoices, public.invoice_lines,
  public.entity_invoice_account_controls FROM anon, authenticated, service_role;
GRANT SELECT ON public.invoices, public.invoice_lines,
  public.entity_invoice_account_controls TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.validate_customer_invoice_graph(uuid) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.configure_entity_invoice_accounts(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.post_customer_invoice(uuid, uuid, text, date, date, text, numeric, text, jsonb, text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.configure_entity_invoice_accounts(uuid, uuid, uuid, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_customer_invoice(uuid, uuid, text, date, date, text, numeric, text, jsonb, text)
  TO authenticated;

COMMIT;
