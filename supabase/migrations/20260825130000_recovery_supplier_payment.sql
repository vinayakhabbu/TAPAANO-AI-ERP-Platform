-- Controlled manual full supplier payments for verified, uncredited,
-- zero-tax functional-currency bills. Amount is derived by PostgreSQL.
-- Partial/over-payments, refunds, payment runs, matching, bank reconciliation,
-- tax, and FX remain unavailable.

BEGIN;

LOCK TABLE public.entities, public.accounts, public.bills,
  public.entity_supplier_bill_account_controls,
  public.supplier_bill_credit_notes, public.accounting_events,
  public.accounting_periods, public.journal_entries, public.journal_lines
  IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE IF NOT EXISTS public.entity_supplier_payment_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  supplier_bill_account_control_id uuid NOT NULL,
  ap_account_id uuid NOT NULL,
  cash_account_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  configured_by uuid NOT NULL REFERENCES auth.users(id),
  configured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_supplier_payment_controls_accounts_distinct_check
    CHECK (ap_account_id<>cash_account_id),
  CONSTRAINT entity_supplier_payment_controls_key_check CHECK (
    idempotency_key=btrim(idempotency_key)
    AND length(idempotency_key) BETWEEN 1 AND 160
    AND idempotency_key !~ '[[:cntrl:]]'
  ),
  CONSTRAINT entity_supplier_payment_controls_org_entity_fkey
    FOREIGN KEY (org_id,entity_id) REFERENCES public.entities(org_id,id),
  CONSTRAINT entity_supplier_payment_controls_org_bill_control_fkey
    FOREIGN KEY (org_id,supplier_bill_account_control_id)
    REFERENCES public.entity_supplier_bill_account_controls(org_id,id),
  CONSTRAINT entity_supplier_payment_controls_org_ap_fkey
    FOREIGN KEY (org_id,ap_account_id) REFERENCES public.accounts(org_id,id),
  CONSTRAINT entity_supplier_payment_controls_org_cash_fkey
    FOREIGN KEY (org_id,cash_account_id) REFERENCES public.accounts(org_id,id),
  UNIQUE (org_id,entity_id),
  UNIQUE (org_id,idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_supplier_payment_controls_org_id_id_uidx
  ON public.entity_supplier_payment_controls (org_id,id);

CREATE TABLE IF NOT EXISTS public.supplier_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  bill_id uuid NOT NULL,
  payment_number text NOT NULL,
  payment_date date NOT NULL,
  currency text NOT NULL,
  amount numeric(15,2) NOT NULL,
  payment_reference text NOT NULL,
  account_control_id uuid NOT NULL,
  accounting_event_id uuid NOT NULL REFERENCES public.accounting_events(id),
  journal_entry_id uuid NOT NULL REFERENCES public.journal_entries(id),
  idempotency_key text NOT NULL,
  payload_hash text NOT NULL,
  posted_by uuid NOT NULL REFERENCES auth.users(id),
  posted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_payments_number_check CHECK (
    payment_number=btrim(payment_number)
    AND length(payment_number) BETWEEN 1 AND 80
    AND payment_number !~ '[[:cntrl:]]'
  ),
  CONSTRAINT supplier_payments_reference_check CHECK (
    payment_reference=btrim(payment_reference)
    AND length(payment_reference) BETWEEN 1 AND 240
    AND payment_reference !~ '[[:cntrl:]]'
  ),
  CONSTRAINT supplier_payments_currency_check CHECK (currency~'^[A-Z]{3}$'),
  CONSTRAINT supplier_payments_amount_check CHECK (
    amount::text NOT IN ('NaN','Infinity','-Infinity')
    AND amount>0 AND round(amount,2)=amount
  ),
  CONSTRAINT supplier_payments_key_check CHECK (
    idempotency_key=btrim(idempotency_key)
    AND length(idempotency_key) BETWEEN 1 AND 160
    AND idempotency_key !~ '[[:cntrl:]]'
    AND payload_hash~'^[0-9a-f]{32}$'
  ),
  CONSTRAINT supplier_payments_org_bill_fkey
    FOREIGN KEY (org_id,entity_id,bill_id)
    REFERENCES public.bills(org_id,entity_id,id),
  CONSTRAINT supplier_payments_org_vendor_fkey
    FOREIGN KEY (org_id,vendor_id) REFERENCES public.vendors(org_id,id),
  CONSTRAINT supplier_payments_org_control_fkey
    FOREIGN KEY (org_id,account_control_id)
    REFERENCES public.entity_supplier_payment_controls(org_id,id),
  UNIQUE (org_id,payment_number),
  UNIQUE (org_id,idempotency_key),
  UNIQUE (bill_id)
);

LOCK TABLE public.entity_supplier_payment_controls, public.supplier_payments
  IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.accounting_events DROP CONSTRAINT IF EXISTS accounting_events_type_check;
ALTER TABLE public.accounting_events ADD CONSTRAINT accounting_events_type_check CHECK (
  event_type IN (
    'manual_journal_posted','journal_reversed','customer_invoice_posted',
    'customer_credit_note_posted','customer_receipt_posted','supplier_bill_posted',
    'supplier_bill_credit_posted','supplier_payment_posted'
  )
);
ALTER TABLE public.accounting_events DROP CONSTRAINT IF EXISTS accounting_events_source_type_check;
ALTER TABLE public.accounting_events ADD CONSTRAINT accounting_events_source_type_check CHECK (
  source_type IN (
    'manual_journal','journal_reversal','customer_invoice','customer_credit_note',
    'customer_receipt','supplier_bill','supplier_bill_credit','supplier_payment'
  )
);
ALTER TABLE public.accounting_events DROP CONSTRAINT IF EXISTS accounting_events_source_shape_check;
ALTER TABLE public.accounting_events ADD CONSTRAINT accounting_events_source_shape_check CHECK (
  (source_type='manual_journal' AND source_id IS NULL)
  OR (source_type IN (
    'journal_reversal','customer_invoice','customer_credit_note','customer_receipt',
    'supplier_bill','supplier_bill_credit','supplier_payment'
  ) AND source_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.guard_supplier_payment_write()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_setting('tapaano.supplier_payment_write',true) IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'supplier payment is immutable; use the trusted full-payment workflow';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_supplier_bill_resolution_conflict()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_bill_id uuid;
BEGIN
  IF TG_TABLE_NAME='supplier_bill_credit_notes' THEN
    v_bill_id:=NEW.original_bill_id;
    IF EXISTS(SELECT 1 FROM public.supplier_payments WHERE bill_id=v_bill_id) THEN
      RAISE EXCEPTION 'supplier bill already has a full payment and cannot be credited';
    END IF;
  ELSE
    v_bill_id:=NEW.bill_id;
    IF EXISTS(SELECT 1 FROM public.supplier_bill_credit_notes WHERE original_bill_id=v_bill_id) THEN
      RAISE EXCEPTION 'supplier bill already has a full credit and cannot be paid';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_invoice_accounting_graph()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_source_type text;
BEGIN
  IF TG_TABLE_NAME='accounting_events' THEN
    IF OLD.source_type='customer_invoice'
       AND current_setting('tapaano.invoice_write',true) IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'invoice accounting event is immutable';
    ELSIF OLD.source_type='customer_credit_note'
       AND current_setting('tapaano.invoice_credit_write',true) IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'customer credit note accounting event is immutable';
    ELSIF OLD.source_type='customer_receipt'
       AND current_setting('tapaano.customer_receipt_write',true) IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'customer receipt accounting event is immutable';
    ELSIF OLD.source_type='supplier_bill'
       AND current_setting('tapaano.supplier_bill_write',true) IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'supplier bill accounting event is immutable';
    ELSIF OLD.source_type='supplier_bill_credit'
       AND current_setting('tapaano.supplier_bill_credit_write',true) IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'supplier credit accounting event is immutable';
    ELSIF OLD.source_type='supplier_payment'
       AND current_setting('tapaano.supplier_payment_write',true) IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'supplier payment accounting event is immutable';
    END IF;
  ELSIF TG_TABLE_NAME='journal_entries' THEN
    IF TG_OP='INSERT' AND NEW.reversal_of_id IS NOT NULL THEN
      SELECT event.source_type INTO v_source_type
      FROM public.journal_entries original
      JOIN public.accounting_events event ON event.id=original.accounting_event_id
      WHERE original.id=NEW.reversal_of_id;
      IF v_source_type='customer_invoice'
         AND current_setting('tapaano.invoice_credit_write',true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'invoice journal reversal requires the trusted full-credit workflow';
      ELSIF v_source_type='customer_credit_note' THEN
        RAISE EXCEPTION 'customer credit-note reversal is unavailable';
      ELSIF v_source_type='customer_receipt' THEN
        RAISE EXCEPTION 'customer receipt reversal is unavailable';
      ELSIF v_source_type='supplier_bill'
         AND current_setting('tapaano.supplier_bill_credit_write',true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'supplier bill reversal requires the trusted vendor-credit workflow';
      ELSIF v_source_type='supplier_bill_credit' THEN
        RAISE EXCEPTION 'supplier credit reversal is unavailable';
      ELSIF v_source_type='supplier_payment' THEN
        RAISE EXCEPTION 'supplier payment reversal is unavailable';
      END IF;
    ELSIF TG_OP IN ('UPDATE','DELETE') THEN
      SELECT source_type INTO v_source_type FROM public.accounting_events WHERE id=OLD.accounting_event_id;
      IF v_source_type='customer_invoice'
         AND current_setting('tapaano.invoice_write',true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'invoice journal is immutable';
      ELSIF v_source_type='customer_credit_note'
         AND current_setting('tapaano.invoice_credit_write',true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'customer credit-note journal is immutable';
      ELSIF v_source_type='customer_receipt'
         AND current_setting('tapaano.customer_receipt_write',true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'customer receipt journal is immutable';
      ELSIF v_source_type='supplier_bill'
         AND current_setting('tapaano.supplier_bill_write',true) IS DISTINCT FROM 'trusted'
         AND current_setting('tapaano.supplier_bill_credit_write',true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'supplier bill journal is immutable';
      ELSIF v_source_type='supplier_bill_credit'
         AND current_setting('tapaano.supplier_bill_credit_write',true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'supplier credit journal is immutable';
      ELSIF v_source_type='supplier_payment'
         AND current_setting('tapaano.supplier_payment_write',true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'supplier payment journal is immutable';
      END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_supplier_payment_graph(p_payment_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_payment public.supplier_payments%ROWTYPE; v_bill public.bills%ROWTYPE;
  v_control public.entity_supplier_payment_controls%ROWTYPE;
  v_bill_control public.entity_supplier_bill_account_controls%ROWTYPE;
  v_event public.accounting_events%ROWTYPE; v_journal public.journal_entries%ROWTYPE;
  v_cash_type public.account_type; v_ap_type public.account_type;
  v_journal_count integer; v_debit numeric; v_credit numeric; v_ap_lines integer; v_cash_lines integer;
BEGIN
  SELECT * INTO v_payment FROM public.supplier_payments WHERE id=p_payment_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_payment.payment_number IS NULL OR v_payment.payment_number IS DISTINCT FROM btrim(v_payment.payment_number)
     OR v_payment.payment_reference IS NULL OR v_payment.payment_reference IS DISTINCT FROM btrim(v_payment.payment_reference)
     OR v_payment.payment_date IS NULL OR v_payment.amount::text IN ('NaN','Infinity','-Infinity')
     OR v_payment.amount<=0 OR round(v_payment.amount,2) IS DISTINCT FROM v_payment.amount
     OR v_payment.account_control_id IS NULL OR v_payment.accounting_event_id IS NULL
     OR v_payment.journal_entry_id IS NULL OR v_payment.posted_by IS NULL THEN
    RAISE EXCEPTION 'supplier payment header is not canonical';
  END IF;
  SELECT * INTO v_bill FROM public.bills WHERE id=v_payment.bill_id;
  IF NOT FOUND OR v_bill.org_id IS DISTINCT FROM v_payment.org_id
     OR v_bill.entity_id IS DISTINCT FROM v_payment.entity_id
     OR v_bill.vendor_id IS DISTINCT FROM v_payment.vendor_id
     OR v_bill.accounting_status IS DISTINCT FROM 'POSTED'
     OR v_bill.total IS DISTINCT FROM v_payment.amount
     OR upper(v_bill.currency) IS DISTINCT FROM upper(v_payment.currency)
     OR v_payment.payment_date<v_bill.issue_date
     OR EXISTS(SELECT 1 FROM public.supplier_bill_credit_notes credit WHERE credit.original_bill_id=v_bill.id) THEN
    RAISE EXCEPTION 'supplier payment bill graph is invalid';
  END IF;
  PERFORM public.validate_supplier_bill_graph(v_bill.id);
  SELECT * INTO v_control FROM public.entity_supplier_payment_controls
  WHERE id=v_payment.account_control_id AND org_id=v_payment.org_id AND entity_id=v_payment.entity_id;
  SELECT * INTO v_bill_control FROM public.entity_supplier_bill_account_controls
  WHERE id=v_control.supplier_bill_account_control_id;
  SELECT account_type INTO v_cash_type FROM public.accounts
  WHERE id=v_control.cash_account_id AND org_id=v_payment.org_id;
  SELECT account_type INTO v_ap_type FROM public.accounts
  WHERE id=v_control.ap_account_id AND org_id=v_payment.org_id;
  IF v_control.id IS NULL OR v_bill_control.id IS NULL
     OR v_control.supplier_bill_account_control_id IS DISTINCT FROM v_bill.account_control_id
     OR v_control.ap_account_id IS DISTINCT FROM v_bill_control.ap_account_id
     OR v_cash_type IS DISTINCT FROM 'asset' OR v_ap_type IS DISTINCT FROM 'liability' THEN
    RAISE EXCEPTION 'supplier payment account control is invalid';
  END IF;
  SELECT * INTO v_event FROM public.accounting_events WHERE id=v_payment.accounting_event_id;
  IF NOT FOUND OR v_event.org_id IS DISTINCT FROM v_payment.org_id
     OR v_event.entity_id IS DISTINCT FROM v_payment.entity_id
     OR v_event.event_type IS DISTINCT FROM 'supplier_payment_posted'
     OR v_event.source_type IS DISTINCT FROM 'supplier_payment'
     OR v_event.source_id IS DISTINCT FROM v_payment.id
     OR v_event.journal_entry_id IS DISTINCT FROM v_payment.journal_entry_id
     OR v_event.actor_id IS DISTINCT FROM v_payment.posted_by THEN
    RAISE EXCEPTION 'supplier payment event graph is invalid';
  END IF;
  SELECT * INTO v_journal FROM public.journal_entries WHERE id=v_payment.journal_entry_id;
  IF NOT FOUND OR v_journal.org_id IS DISTINCT FROM v_payment.org_id
     OR v_journal.entity_id IS DISTINCT FROM v_payment.entity_id
     OR v_journal.status::text IS DISTINCT FROM 'posted'
     OR v_journal.source_module IS DISTINCT FROM 'ap_payment'
     OR v_journal.entry_date IS DISTINCT FROM v_payment.payment_date
     OR v_journal.accounting_event_id IS DISTINCT FROM v_payment.accounting_event_id
     OR v_journal.created_by IS DISTINCT FROM v_payment.posted_by
     OR v_journal.accounting_period_id IS NULL
     OR v_journal.reversal_of_id IS NOT NULL OR v_journal.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'supplier payment journal graph is invalid';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_periods period
    WHERE period.id=v_journal.accounting_period_id AND period.org_id=v_payment.org_id
      AND period.entity_id=v_payment.entity_id
      AND v_payment.payment_date BETWEEN period.period_start AND period.period_end) THEN
    RAISE EXCEPTION 'supplier payment period graph is invalid';
  END IF;
  SELECT count(*),COALESCE(sum(debit),0),COALESCE(sum(credit),0),
    count(*) FILTER(WHERE account_id=v_control.ap_account_id AND debit=v_payment.amount AND credit=0),
    count(*) FILTER(WHERE account_id=v_control.cash_account_id AND credit=v_payment.amount AND debit=0)
  INTO v_journal_count,v_debit,v_credit,v_ap_lines,v_cash_lines
  FROM public.journal_lines WHERE journal_entry_id=v_journal.id;
  IF v_journal_count IS DISTINCT FROM 2 OR v_debit IS DISTINCT FROM v_payment.amount
     OR v_credit IS DISTINCT FROM v_payment.amount OR v_ap_lines IS DISTINCT FROM 1
     OR v_cash_lines IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'supplier payment journal lines do not reconcile';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_supplier_payment_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_payment_id uuid;
BEGIN
  IF TG_OP='DELETE' THEN v_payment_id:=OLD.id; ELSE v_payment_id:=NEW.id; END IF;
  PERFORM public.validate_supplier_payment_graph(v_payment_id);
  RETURN NULL;
END;
$$;

DO $$ DECLARE target_table text; BEGIN
  FOREACH target_table IN ARRAY ARRAY['entity_supplier_payment_controls','supplier_payments'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guard_supplier_payment_write ON public.%I',target_table);
    EXECUTE format('CREATE TRIGGER guard_supplier_payment_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_payment_write()',target_table);
    EXECUTE format('DROP TRIGGER IF EXISTS guard_supplier_payment_truncate ON public.%I',target_table);
    EXECUTE format('CREATE TRIGGER guard_supplier_payment_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_supplier_payment_write()',target_table);
  END LOOP;
END $$;
DROP TRIGGER IF EXISTS validate_supplier_payment_deferred ON public.supplier_payments;
CREATE CONSTRAINT TRIGGER validate_supplier_payment_deferred
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_payments
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
  EXECUTE FUNCTION public.validate_supplier_payment_trigger();
DROP TRIGGER IF EXISTS prevent_supplier_resolution_conflict ON public.supplier_payments;
CREATE TRIGGER prevent_supplier_resolution_conflict BEFORE INSERT ON public.supplier_payments
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bill_resolution_conflict();
DROP TRIGGER IF EXISTS prevent_supplier_resolution_conflict ON public.supplier_bill_credit_notes;
CREATE TRIGGER prevent_supplier_resolution_conflict BEFORE INSERT ON public.supplier_bill_credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bill_resolution_conflict();

DROP TRIGGER IF EXISTS guard_invoice_events_graph ON public.accounting_events;
CREATE TRIGGER guard_invoice_events_graph BEFORE UPDATE OR DELETE ON public.accounting_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_accounting_graph();
DROP TRIGGER IF EXISTS guard_invoice_journals_graph ON public.journal_entries;
CREATE TRIGGER guard_invoice_journals_graph BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_accounting_graph();

CREATE OR REPLACE FUNCTION public.configure_entity_supplier_payment_accounts(
  p_entity_id uuid,p_cash_account_id uuid,p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_org_id uuid; v_actor uuid; v_bill_control public.entity_supplier_bill_account_controls%ROWTYPE;
  v_control public.entity_supplier_payment_controls%ROWTYPE; v_cash_type public.account_type;
BEGIN
  v_org_id:=public.get_user_org_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor:=public.assert_accounting_actor(v_org_id);
  IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity_id AND org_id=v_org_id) THEN
    RAISE EXCEPTION 'entity not found or unavailable';
  END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key IS DISTINCT FROM btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 160 OR p_idempotency_key~'[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid supplier payment account control request';
  END IF;
  LOCK TABLE public.entity_supplier_payment_controls IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_control FROM public.entity_supplier_payment_controls
  WHERE org_id=v_org_id AND entity_id=p_entity_id;
  IF FOUND THEN
    IF v_control.cash_account_id IS DISTINCT FROM p_cash_account_id
       OR v_control.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
      RAISE EXCEPTION 'entity supplier payment account control is immutable';
    END IF;
    RETURN v_control.id;
  END IF;
  SELECT * INTO v_bill_control FROM public.entity_supplier_bill_account_controls
  WHERE org_id=v_org_id AND entity_id=p_entity_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'entity supplier bill account control is not configured'; END IF;
  SELECT account_type INTO v_cash_type FROM public.accounts
  WHERE id=p_cash_account_id AND org_id=v_org_id AND is_active=true FOR UPDATE;
  IF NOT FOUND OR v_cash_type IS DISTINCT FROM 'asset' THEN
    RAISE EXCEPTION 'cash clearing must be an active asset account in the organization';
  END IF;
  PERFORM set_config('tapaano.supplier_payment_write','trusted',true);
  INSERT INTO public.entity_supplier_payment_controls(
    org_id,entity_id,supplier_bill_account_control_id,ap_account_id,cash_account_id,
    idempotency_key,configured_by
  ) VALUES(v_org_id,p_entity_id,v_bill_control.id,v_bill_control.ap_account_id,
    p_cash_account_id,p_idempotency_key,v_actor) RETURNING * INTO v_control;
  RETURN v_control.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_supplier_payment(
  p_bill_id uuid,p_payment_number text,p_payment_date date,p_currency text,
  p_reference text,p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_org_id uuid; v_actor uuid; v_bill public.bills%ROWTYPE;
  v_control public.entity_supplier_payment_controls%ROWTYPE;
  v_period_id uuid; v_payment_id uuid:=gen_random_uuid(); v_event_id uuid; v_journal_id uuid;
  v_existing_id uuid; v_existing_bill_id uuid; v_existing_hash text; v_payload_hash text;
BEGIN
  v_org_id:=public.get_user_org_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor:=public.assert_accounting_actor(v_org_id);
  IF p_payment_number IS NULL OR p_payment_number IS DISTINCT FROM btrim(p_payment_number)
     OR length(p_payment_number) NOT BETWEEN 1 AND 80 OR p_payment_number~'[[:cntrl:]]'
     OR p_reference IS NULL OR p_reference IS DISTINCT FROM btrim(p_reference)
     OR length(p_reference) NOT BETWEEN 1 AND 240 OR p_reference~'[[:cntrl:]]'
     OR p_payment_date IS NULL OR p_idempotency_key IS NULL
     OR p_idempotency_key IS DISTINCT FROM btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 160 OR p_idempotency_key~'[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid supplier payment request';
  END IF;
  v_payload_hash:=md5(jsonb_build_object('bill_id',p_bill_id,'payment_number',p_payment_number,
    'payment_date',p_payment_date,'currency',upper(p_currency),'reference',p_reference)::text);
  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.accounting_events IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.bills IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.supplier_bill_credit_notes IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.supplier_payments IN SHARE ROW EXCLUSIVE MODE;
  SELECT id,bill_id,payload_hash INTO v_existing_id,v_existing_bill_id,v_existing_hash
  FROM public.supplier_payments WHERE org_id=v_org_id AND idempotency_key=p_idempotency_key;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_bill_id IS DISTINCT FROM p_bill_id OR v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'supplier payment idempotency key conflicts with another payload';
    END IF;
    PERFORM public.validate_supplier_payment_graph(v_existing_id);
    RETURN v_existing_id;
  END IF;
  SELECT * INTO v_bill FROM public.bills
  WHERE id=p_bill_id AND org_id=v_org_id AND accounting_status='POSTED'
    AND journal_entry_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'posted supplier bill not found or unavailable'; END IF;
  IF p_payment_date<v_bill.issue_date THEN RAISE EXCEPTION 'supplier payment date cannot precede bill date'; END IF;
  IF upper(p_currency) IS DISTINCT FROM upper(v_bill.currency) THEN
    RAISE EXCEPTION 'supplier payment must use the bill functional currency';
  END IF;
  IF EXISTS(SELECT 1 FROM public.supplier_bill_credit_notes WHERE original_bill_id=v_bill.id) THEN
    RAISE EXCEPTION 'supplier bill already has a full credit and cannot be paid';
  END IF;
  IF EXISTS(SELECT 1 FROM public.supplier_payments WHERE bill_id=v_bill.id) THEN
    RAISE EXCEPTION 'supplier bill already has a full supplier payment';
  END IF;
  PERFORM public.validate_supplier_bill_graph(v_bill.id);
  SELECT * INTO v_control FROM public.entity_supplier_payment_controls
  WHERE org_id=v_org_id AND entity_id=v_bill.entity_id
    AND supplier_bill_account_control_id=v_bill.account_control_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'entity supplier payment account control is not configured'; END IF;
  PERFORM 1 FROM public.accounts WHERE id=v_control.ap_account_id AND org_id=v_org_id
    AND account_type='liability' AND is_active=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AP control account is inactive or invalid'; END IF;
  PERFORM 1 FROM public.accounts WHERE id=v_control.cash_account_id AND org_id=v_org_id
    AND account_type='asset' AND is_active=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cash clearing account is inactive or invalid'; END IF;
  SELECT id INTO v_period_id FROM public.accounting_periods
  WHERE org_id=v_org_id AND entity_id=v_bill.entity_id
    AND p_payment_date BETWEEN period_start AND period_end AND status='OPEN' FOR UPDATE;
  IF v_period_id IS NULL THEN RAISE EXCEPTION 'an OPEN accounting period is required'; END IF;
  PERFORM set_config('tapaano.accounting_write','trusted',true);
  PERFORM set_config('tapaano.supplier_payment_write','trusted',true);
  INSERT INTO public.accounting_events(
    org_id,entity_id,event_type,source_type,source_id,idempotency_key,payload_hash,actor_id
  ) VALUES(v_org_id,v_bill.entity_id,'supplier_payment_posted','supplier_payment',
    v_payment_id,p_idempotency_key,v_payload_hash,v_actor) RETURNING id INTO v_event_id;
  INSERT INTO public.journal_entries(
    org_id,entity_id,entry_number,entry_date,memo,status,created_by,posted_at,
    source_module,accounting_period_id,accounting_event_id
  ) VALUES(v_org_id,v_bill.entity_id,
    'SP-'||left(p_payment_number,40)||'-'||left(md5(p_idempotency_key),8),
    p_payment_date,'Supplier payment '||p_payment_number||': '||p_reference,
    'posted',v_actor,now(),'ap_payment',v_period_id,v_event_id) RETURNING id INTO v_journal_id;
  INSERT INTO public.journal_lines(
    journal_entry_id,account_id,debit,credit,memo,org_id,entity_id,line_number
  ) VALUES
    (v_journal_id,v_control.ap_account_id,v_bill.total,0,'Settle accounts payable',v_org_id,v_bill.entity_id,1),
    (v_journal_id,v_control.cash_account_id,0,v_bill.total,'Cash clearing',v_org_id,v_bill.entity_id,2);
  INSERT INTO public.supplier_payments(
    id,org_id,entity_id,vendor_id,bill_id,payment_number,payment_date,currency,
    amount,payment_reference,account_control_id,accounting_event_id,journal_entry_id,
    idempotency_key,payload_hash,posted_by,posted_at
  ) VALUES(v_payment_id,v_org_id,v_bill.entity_id,v_bill.vendor_id,v_bill.id,
    p_payment_number,p_payment_date,upper(v_bill.currency),v_bill.total,p_reference,
    v_control.id,v_event_id,v_journal_id,p_idempotency_key,v_payload_hash,v_actor,now());
  UPDATE public.accounting_events SET journal_entry_id=v_journal_id WHERE id=v_event_id;
  PERFORM public.validate_supplier_payment_graph(v_payment_id);
  RETURN v_payment_id;
END;
$$;

DO $$ DECLARE payment_record record; BEGIN
  FOR payment_record IN SELECT id FROM public.supplier_payments LOOP
    PERFORM public.validate_supplier_payment_graph(payment_record.id);
  END LOOP;
END $$;

ALTER TABLE public.entity_supplier_payment_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE target_table text; policy_record record; column_record record;
  role_name text; routine record; drop_kind text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['entity_supplier_payment_controls','supplier_payments'] LOOP
    FOR policy_record IN SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=target_table LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',policy_record.policyname,target_table);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (org_id=public.get_user_org_id())',target_table||'_tenant_read',target_table);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',target_table);
    FOR column_record IN SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name=target_table LOOP
      EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM PUBLIC',column_record.column_name,target_table);
      FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
        EXECUTE format('REVOKE ALL PRIVILEGES (%I) ON TABLE public.%I FROM %I',column_record.column_name,target_table,role_name);
      END LOOP;
    END LOOP;
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated',target_table);
    IF EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime'
      AND schemaname='public' AND tablename=target_table) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I',target_table);
    END IF;
  END LOOP;
  FOR routine IN SELECT n.nspname,p.proname,p.prokind,
      pg_get_function_identity_arguments(p.oid) AS args,oidvectortypes(p.proargtypes) AS types
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN(
      'configure_entity_supplier_payment_accounts','post_supplier_payment'
    ) LOOP
    IF routine.prokind<>'f'
       OR (routine.proname='configure_entity_supplier_payment_accounts' AND routine.types<>'uuid, uuid, text')
       OR (routine.proname='post_supplier_payment' AND routine.types<>'uuid, text, date, text, text, text') THEN
      drop_kind:=CASE WHEN routine.prokind='p' THEN 'PROCEDURE' ELSE 'FUNCTION' END;
      EXECUTE format('DROP %s %I.%I(%s)',drop_kind,routine.nspname,routine.proname,routine.args);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.validate_supplier_payment_graph(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.configure_entity_supplier_payment_accounts(uuid,uuid,text)
  FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.post_supplier_payment(uuid,text,date,text,text,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.configure_entity_supplier_payment_accounts(uuid,uuid,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_supplier_payment(uuid,text,date,text,text,text)
  TO authenticated;

COMMIT;
