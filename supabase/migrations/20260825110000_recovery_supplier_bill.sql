-- First controlled supplier-bill posting slice. Supported boundary: direct,
-- zero-tax bills in entity functional currency using one immutable AP account
-- and one immutable expense account. Approval, matching, PO/receipt conversion,
-- payment, vendor credit, tax, and FX remain unavailable.

BEGIN;

LOCK TABLE public.entities, public.vendors, public.accounts, public.bills,
  public.accounting_events, public.accounting_periods,
  public.journal_entries, public.journal_lines IN SHARE ROW EXCLUSIVE MODE;

CREATE UNIQUE INDEX IF NOT EXISTS vendors_org_id_id_supplier_bill_uidx
  ON public.vendors (org_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS bills_org_id_entity_id_supplier_bill_uidx
  ON public.bills (org_id, entity_id, id);

CREATE TABLE IF NOT EXISTS public.entity_supplier_bill_account_controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  ap_account_id uuid NOT NULL,
  expense_account_id uuid NOT NULL,
  idempotency_key text NOT NULL,
  configured_by uuid NOT NULL REFERENCES auth.users(id),
  configured_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT entity_supplier_bill_controls_accounts_distinct_check
    CHECK (ap_account_id <> expense_account_id),
  CONSTRAINT entity_supplier_bill_controls_key_check CHECK (
    idempotency_key = btrim(idempotency_key)
    AND length(idempotency_key) BETWEEN 1 AND 160
    AND idempotency_key !~ '[[:cntrl:]]'
  ),
  CONSTRAINT entity_supplier_bill_controls_org_entity_fkey
    FOREIGN KEY (org_id, entity_id) REFERENCES public.entities(org_id, id),
  CONSTRAINT entity_supplier_bill_controls_org_ap_fkey
    FOREIGN KEY (org_id, ap_account_id) REFERENCES public.accounts(org_id, id),
  CONSTRAINT entity_supplier_bill_controls_org_expense_fkey
    FOREIGN KEY (org_id, expense_account_id) REFERENCES public.accounts(org_id, id),
  UNIQUE (org_id, entity_id),
  UNIQUE (org_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS entity_supplier_bill_controls_org_id_id_uidx
  ON public.entity_supplier_bill_account_controls (org_id, id);

ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS accounting_status text NOT NULL DEFAULT 'UNVERIFIED_LEGACY',
  ADD COLUMN IF NOT EXISTS account_control_id uuid,
  ADD COLUMN IF NOT EXISTS accounting_event_id uuid,
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid,
  ADD COLUMN IF NOT EXISTS posted_at timestamptz,
  ADD COLUMN IF NOT EXISTS posted_by uuid;

CREATE TABLE IF NOT EXISTS public.bill_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  bill_id uuid NOT NULL,
  line_number integer NOT NULL,
  description text NOT NULL,
  quantity numeric(18,4) NOT NULL,
  unit_price numeric(18,4) NOT NULL,
  line_total numeric(15,2) NOT NULL,
  expense_account_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bill_lines_number_check CHECK (line_number > 0),
  CONSTRAINT bill_lines_description_check CHECK (
    description = btrim(description) AND length(description) > 0
    AND description !~ '[[:cntrl:]]'
  ),
  CONSTRAINT bill_lines_value_check CHECK (
    quantity::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND unit_price::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND line_total::text NOT IN ('NaN', 'Infinity', '-Infinity')
    AND quantity > 0 AND unit_price > 0 AND line_total > 0
    AND round(quantity,4)=quantity AND round(unit_price,4)=unit_price
    AND round(quantity*unit_price,2)=line_total
  ),
  CONSTRAINT bill_lines_org_bill_fkey
    FOREIGN KEY (org_id, entity_id, bill_id)
    REFERENCES public.bills(org_id, entity_id, id),
  CONSTRAINT bill_lines_org_expense_fkey
    FOREIGN KEY (org_id, expense_account_id) REFERENCES public.accounts(org_id, id),
  UNIQUE (bill_id, line_number)
);

LOCK TABLE public.entity_supplier_bill_account_controls, public.bill_lines
  IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.bills bill
    WHERE bill.accounting_status NOT IN ('UNVERIFIED_LEGACY','POSTED')
       OR (bill.accounting_status='UNVERIFIED_LEGACY' AND (
         bill.account_control_id IS NOT NULL OR bill.accounting_event_id IS NOT NULL
         OR bill.journal_entry_id IS NOT NULL OR bill.posted_at IS NOT NULL
         OR bill.posted_by IS NOT NULL
       ))
  ) THEN
    RAISE EXCEPTION 'supplier bill preflight: invalid legacy accounting provenance';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bills_accounting_status_check') THEN
    ALTER TABLE public.bills ADD CONSTRAINT bills_accounting_status_check
      CHECK (accounting_status IN ('UNVERIFIED_LEGACY','POSTED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bills_account_control_id_fkey') THEN
    ALTER TABLE public.bills ADD CONSTRAINT bills_account_control_id_fkey
      FOREIGN KEY (org_id,account_control_id)
      REFERENCES public.entity_supplier_bill_account_controls(org_id,id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bills_accounting_event_id_fkey') THEN
    ALTER TABLE public.bills ADD CONSTRAINT bills_accounting_event_id_fkey
      FOREIGN KEY (accounting_event_id) REFERENCES public.accounting_events(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bills_journal_entry_id_fkey') THEN
    ALTER TABLE public.bills ADD CONSTRAINT bills_journal_entry_id_fkey
      FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='bills_posted_by_fkey') THEN
    ALTER TABLE public.bills ADD CONSTRAINT bills_posted_by_fkey
      FOREIGN KEY (posted_by) REFERENCES auth.users(id);
  END IF;
END;
$$;

ALTER TABLE public.accounting_events DROP CONSTRAINT IF EXISTS accounting_events_type_check;
ALTER TABLE public.accounting_events ADD CONSTRAINT accounting_events_type_check CHECK (
  event_type IN (
    'manual_journal_posted','journal_reversed','customer_invoice_posted',
    'customer_credit_note_posted','customer_receipt_posted','supplier_bill_posted'
  )
);
ALTER TABLE public.accounting_events DROP CONSTRAINT IF EXISTS accounting_events_source_type_check;
ALTER TABLE public.accounting_events ADD CONSTRAINT accounting_events_source_type_check CHECK (
  source_type IN (
    'manual_journal','journal_reversal','customer_invoice','customer_credit_note',
    'customer_receipt','supplier_bill'
  )
);
ALTER TABLE public.accounting_events DROP CONSTRAINT IF EXISTS accounting_events_source_shape_check;
ALTER TABLE public.accounting_events ADD CONSTRAINT accounting_events_source_shape_check CHECK (
  (source_type='manual_journal' AND source_id IS NULL)
  OR (source_type IN (
    'journal_reversal','customer_invoice','customer_credit_note',
    'customer_receipt','supplier_bill'
  ) AND source_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.guard_supplier_bill_write()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_setting('tapaano.supplier_bill_write',true) IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'supplier bill is immutable; use the trusted supplier-bill workflow';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
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
      ELSIF v_source_type='supplier_bill' THEN
        RAISE EXCEPTION 'supplier bill reversal requires a future vendor-credit workflow';
      END IF;
    ELSIF TG_OP IN ('UPDATE','DELETE') THEN
      SELECT source_type INTO v_source_type FROM public.accounting_events
      WHERE id=OLD.accounting_event_id;
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
         AND current_setting('tapaano.supplier_bill_write',true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'supplier bill journal is immutable';
      END IF;
    END IF;
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_supplier_bill_graph(p_bill_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_bill public.bills%ROWTYPE;
  v_control public.entity_supplier_bill_account_controls%ROWTYPE;
  v_event public.accounting_events%ROWTYPE;
  v_journal public.journal_entries%ROWTYPE;
  v_entity_currency text;
  v_ap_type public.account_type;
  v_expense_type public.account_type;
  v_line_count integer; v_line_total numeric;
  v_journal_count integer; v_debit numeric; v_credit numeric;
  v_expense_lines integer; v_ap_lines integer;
BEGIN
  SELECT * INTO v_bill FROM public.bills WHERE id=p_bill_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_bill.accounting_status='UNVERIFIED_LEGACY' THEN
    IF v_bill.account_control_id IS NOT NULL OR v_bill.accounting_event_id IS NOT NULL
       OR v_bill.journal_entry_id IS NOT NULL OR v_bill.posted_at IS NOT NULL
       OR v_bill.posted_by IS NOT NULL
       OR EXISTS(SELECT 1 FROM public.bill_lines WHERE bill_id=v_bill.id) THEN
      RAISE EXCEPTION 'unverified legacy bill cannot claim accounting provenance';
    END IF;
    RETURN;
  END IF;
  IF v_bill.accounting_status IS DISTINCT FROM 'POSTED'
     OR v_bill.account_control_id IS NULL OR v_bill.accounting_event_id IS NULL
     OR v_bill.journal_entry_id IS NULL OR v_bill.posted_at IS NULL OR v_bill.posted_by IS NULL
     OR v_bill.status::text IS DISTINCT FROM 'pending'
     OR v_bill.issue_date IS NULL OR v_bill.due_date IS NULL OR v_bill.due_date<v_bill.issue_date
     OR v_bill.subtotal::text IN ('NaN','Infinity','-Infinity')
     OR v_bill.tax::text IN ('NaN','Infinity','-Infinity')
     OR v_bill.total::text IN ('NaN','Infinity','-Infinity')
     OR v_bill.functional_total::text IN ('NaN','Infinity','-Infinity')
     OR v_bill.amount_paid IS DISTINCT FROM 0 OR v_bill.tax IS DISTINCT FROM 0
     OR v_bill.subtotal<=0 OR v_bill.total IS DISTINCT FROM v_bill.subtotal
     OR v_bill.exchange_rate IS DISTINCT FROM 1 OR v_bill.functional_total IS DISTINCT FROM v_bill.total
     OR v_bill.purchase_order_id IS NOT NULL OR v_bill.goods_receipt_id IS NOT NULL
     OR v_bill.tax_code_id IS NOT NULL OR v_bill.match_status IS DISTINCT FROM 'unmatched' THEN
    RAISE EXCEPTION 'posted supplier bill header is not canonical';
  END IF;
  SELECT currency INTO v_entity_currency FROM public.entities
  WHERE id=v_bill.entity_id AND org_id=v_bill.org_id;
  IF upper(v_bill.currency) IS DISTINCT FROM upper(v_entity_currency) THEN
    RAISE EXCEPTION 'posted supplier bill is not in entity functional currency';
  END IF;
  SELECT * INTO v_control FROM public.entity_supplier_bill_account_controls
  WHERE id=v_bill.account_control_id AND org_id=v_bill.org_id AND entity_id=v_bill.entity_id;
  SELECT account_type INTO v_ap_type FROM public.accounts
  WHERE id=v_control.ap_account_id AND org_id=v_bill.org_id;
  SELECT account_type INTO v_expense_type FROM public.accounts
  WHERE id=v_control.expense_account_id AND org_id=v_bill.org_id;
  IF v_control.id IS NULL OR v_ap_type IS DISTINCT FROM 'liability'
     OR v_expense_type IS DISTINCT FROM 'expense' THEN
    RAISE EXCEPTION 'supplier bill account control is invalid';
  END IF;
  SELECT * INTO v_event FROM public.accounting_events WHERE id=v_bill.accounting_event_id;
  IF NOT FOUND OR v_event.org_id IS DISTINCT FROM v_bill.org_id
     OR v_event.entity_id IS DISTINCT FROM v_bill.entity_id
     OR v_event.event_type IS DISTINCT FROM 'supplier_bill_posted'
     OR v_event.source_type IS DISTINCT FROM 'supplier_bill'
     OR v_event.source_id IS DISTINCT FROM v_bill.id
     OR v_event.journal_entry_id IS DISTINCT FROM v_bill.journal_entry_id
     OR v_event.actor_id IS DISTINCT FROM v_bill.posted_by THEN
    RAISE EXCEPTION 'supplier bill event graph is invalid';
  END IF;
  SELECT * INTO v_journal FROM public.journal_entries WHERE id=v_bill.journal_entry_id;
  IF NOT FOUND OR v_journal.org_id IS DISTINCT FROM v_bill.org_id
     OR v_journal.entity_id IS DISTINCT FROM v_bill.entity_id
     OR v_journal.status::text IS DISTINCT FROM 'posted'
     OR v_journal.source_module IS DISTINCT FROM 'ap'
     OR v_journal.entry_date IS DISTINCT FROM v_bill.issue_date
     OR v_journal.accounting_event_id IS DISTINCT FROM v_bill.accounting_event_id
     OR v_journal.created_by IS DISTINCT FROM v_bill.posted_by
     OR v_journal.accounting_period_id IS NULL
     OR v_journal.reversal_of_id IS NOT NULL OR v_journal.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'supplier bill journal graph is invalid';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_periods period
    WHERE period.id=v_journal.accounting_period_id AND period.org_id=v_bill.org_id
      AND period.entity_id=v_bill.entity_id
      AND v_bill.issue_date BETWEEN period.period_start AND period.period_end) THEN
    RAISE EXCEPTION 'supplier bill period graph is invalid';
  END IF;
  SELECT count(*),COALESCE(sum(line_total),0) INTO v_line_count,v_line_total
  FROM public.bill_lines WHERE bill_id=v_bill.id AND org_id=v_bill.org_id
    AND entity_id=v_bill.entity_id AND expense_account_id=v_control.expense_account_id;
  IF v_line_count<1 OR v_line_total IS DISTINCT FROM v_bill.subtotal
     OR EXISTS(SELECT 1 FROM public.bill_lines WHERE bill_id=v_bill.id
       AND expense_account_id<>v_control.expense_account_id) THEN
    RAISE EXCEPTION 'supplier bill lines do not reconcile';
  END IF;
  SELECT count(*),COALESCE(sum(debit),0),COALESCE(sum(credit),0),
    count(*) FILTER(WHERE account_id=v_control.expense_account_id AND debit=v_bill.total AND credit=0),
    count(*) FILTER(WHERE account_id=v_control.ap_account_id AND credit=v_bill.total AND debit=0)
  INTO v_journal_count,v_debit,v_credit,v_expense_lines,v_ap_lines
  FROM public.journal_lines WHERE journal_entry_id=v_journal.id;
  IF v_journal_count IS DISTINCT FROM 2 OR v_debit IS DISTINCT FROM v_bill.total
     OR v_credit IS DISTINCT FROM v_bill.total OR v_expense_lines IS DISTINCT FROM 1
     OR v_ap_lines IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'supplier bill journal lines do not reconcile';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_supplier_bill_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_bill_id uuid;
BEGIN
  IF TG_TABLE_NAME='bills' THEN
    IF TG_OP='DELETE' THEN v_bill_id:=OLD.id; ELSE v_bill_id:=NEW.id; END IF;
  ELSE
    IF TG_OP='DELETE' THEN v_bill_id:=OLD.bill_id; ELSE v_bill_id:=NEW.bill_id; END IF;
  END IF;
  PERFORM public.validate_supplier_bill_graph(v_bill_id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS guard_bills_write ON public.bills;
DROP TRIGGER IF EXISTS guard_bills_truncate ON public.bills;
DROP TRIGGER IF EXISTS guard_supplier_bill_write ON public.bills;
CREATE TRIGGER guard_supplier_bill_write BEFORE INSERT OR UPDATE OR DELETE ON public.bills
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bill_write();
DROP TRIGGER IF EXISTS guard_supplier_bill_truncate ON public.bills;
CREATE TRIGGER guard_supplier_bill_truncate BEFORE TRUNCATE ON public.bills
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_supplier_bill_write();
DROP TRIGGER IF EXISTS validate_supplier_bill_deferred ON public.bills;
CREATE CONSTRAINT TRIGGER validate_supplier_bill_deferred AFTER INSERT OR UPDATE ON public.bills
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_supplier_bill_trigger();

DROP TRIGGER IF EXISTS guard_supplier_bill_line_write ON public.bill_lines;
CREATE TRIGGER guard_supplier_bill_line_write BEFORE INSERT OR UPDATE OR DELETE ON public.bill_lines
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bill_write();
DROP TRIGGER IF EXISTS guard_supplier_bill_line_truncate ON public.bill_lines;
CREATE TRIGGER guard_supplier_bill_line_truncate BEFORE TRUNCATE ON public.bill_lines
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_supplier_bill_write();
DROP TRIGGER IF EXISTS validate_supplier_bill_line_deferred ON public.bill_lines;
CREATE CONSTRAINT TRIGGER validate_supplier_bill_line_deferred AFTER INSERT OR UPDATE OR DELETE ON public.bill_lines
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_supplier_bill_trigger();

DROP TRIGGER IF EXISTS guard_supplier_bill_control_write ON public.entity_supplier_bill_account_controls;
CREATE TRIGGER guard_supplier_bill_control_write BEFORE INSERT OR UPDATE OR DELETE ON public.entity_supplier_bill_account_controls
  FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bill_write();
DROP TRIGGER IF EXISTS guard_supplier_bill_control_truncate ON public.entity_supplier_bill_account_controls;
CREATE TRIGGER guard_supplier_bill_control_truncate BEFORE TRUNCATE ON public.entity_supplier_bill_account_controls
  FOR EACH STATEMENT EXECUTE FUNCTION public.guard_supplier_bill_write();

DROP TRIGGER IF EXISTS guard_invoice_events_graph ON public.accounting_events;
CREATE TRIGGER guard_invoice_events_graph BEFORE UPDATE OR DELETE ON public.accounting_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_accounting_graph();
DROP TRIGGER IF EXISTS guard_invoice_journals_graph ON public.journal_entries;
CREATE TRIGGER guard_invoice_journals_graph BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_accounting_graph();

CREATE OR REPLACE FUNCTION public.configure_entity_supplier_bill_accounts(
  p_entity_id uuid,p_ap_account_id uuid,p_expense_account_id uuid,p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_org_id uuid; v_actor uuid; v_control public.entity_supplier_bill_account_controls%ROWTYPE;
  v_ap_type public.account_type; v_expense_type public.account_type;
BEGIN
  v_org_id:=public.get_user_org_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor:=public.assert_accounting_actor(v_org_id);
  IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity_id AND org_id=v_org_id) THEN
    RAISE EXCEPTION 'entity not found or unavailable';
  END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key IS DISTINCT FROM btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 160 OR p_idempotency_key~'[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid supplier bill account control request';
  END IF;
  LOCK TABLE public.entity_supplier_bill_account_controls IN SHARE ROW EXCLUSIVE MODE;
  SELECT * INTO v_control FROM public.entity_supplier_bill_account_controls
  WHERE org_id=v_org_id AND entity_id=p_entity_id;
  IF FOUND THEN
    IF v_control.ap_account_id IS DISTINCT FROM p_ap_account_id
       OR v_control.expense_account_id IS DISTINCT FROM p_expense_account_id
       OR v_control.idempotency_key IS DISTINCT FROM p_idempotency_key THEN
      RAISE EXCEPTION 'entity supplier bill account control is immutable';
    END IF;
    RETURN v_control.id;
  END IF;
  SELECT account_type INTO v_ap_type FROM public.accounts
  WHERE id=p_ap_account_id AND org_id=v_org_id AND is_active=true FOR UPDATE;
  IF NOT FOUND OR v_ap_type IS DISTINCT FROM 'liability' THEN
    RAISE EXCEPTION 'AP control must be an active liability account in the organization';
  END IF;
  SELECT account_type INTO v_expense_type FROM public.accounts
  WHERE id=p_expense_account_id AND org_id=v_org_id AND is_active=true FOR UPDATE;
  IF NOT FOUND OR v_expense_type IS DISTINCT FROM 'expense' THEN
    RAISE EXCEPTION 'expense control must be an active expense account in the organization';
  END IF;
  PERFORM set_config('tapaano.supplier_bill_write','trusted',true);
  INSERT INTO public.entity_supplier_bill_account_controls(
    org_id,entity_id,ap_account_id,expense_account_id,idempotency_key,configured_by
  ) VALUES(v_org_id,p_entity_id,p_ap_account_id,p_expense_account_id,p_idempotency_key,v_actor)
  RETURNING * INTO v_control;
  RETURN v_control.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.post_supplier_bill(
  p_entity_id uuid,p_vendor_id uuid,p_bill_number text,p_issue_date date,
  p_due_date date,p_currency text,p_tax numeric,p_notes text,p_lines jsonb,
  p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_org_id uuid; v_currency text; v_actor uuid;
  v_control public.entity_supplier_bill_account_controls%ROWTYPE;
  v_period_id uuid; v_event_id uuid; v_existing_bill_id uuid; v_existing_hash text;
  v_payload_hash text; v_bill_id uuid:=gen_random_uuid(); v_journal_id uuid;
  v_line jsonb; v_description text; v_quantity numeric; v_unit_price numeric;
  v_line_total numeric; v_subtotal numeric:=0; v_line_number integer:=0;
BEGIN
  v_org_id:=public.get_user_org_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor:=public.assert_accounting_actor(v_org_id);
  SELECT currency INTO v_currency FROM public.entities
  WHERE id=p_entity_id AND org_id=v_org_id;
  IF v_currency IS NULL THEN RAISE EXCEPTION 'entity not found or unavailable'; END IF;
  IF p_idempotency_key IS NULL OR p_idempotency_key IS DISTINCT FROM btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 160 OR p_idempotency_key~'[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid supplier bill idempotency key';
  END IF;
  v_payload_hash:=md5(jsonb_build_object(
    'entity_id',p_entity_id,'vendor_id',p_vendor_id,'bill_number',btrim(p_bill_number),
    'issue_date',p_issue_date,'due_date',p_due_date,'currency',upper(p_currency),
    'tax',p_tax,'notes',p_notes,'lines',p_lines
  )::text);
  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.accounting_events IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.bills IN SHARE ROW EXCLUSIVE MODE;
  SELECT source_id,payload_hash INTO v_existing_bill_id,v_existing_hash
  FROM public.accounting_events WHERE org_id=v_org_id AND source_type='supplier_bill'
    AND idempotency_key=p_idempotency_key;
  IF v_existing_bill_id IS NOT NULL THEN
    IF v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'supplier bill idempotency key conflicts with another payload';
    END IF;
    PERFORM public.validate_supplier_bill_graph(v_existing_bill_id);
    RETURN v_existing_bill_id;
  END IF;
  IF p_bill_number IS NULL OR p_bill_number IS DISTINCT FROM btrim(p_bill_number)
     OR length(p_bill_number) NOT BETWEEN 1 AND 80 OR p_bill_number~'[[:cntrl:]]'
     OR p_issue_date IS NULL OR p_due_date IS NULL OR p_due_date<p_issue_date THEN
    RAISE EXCEPTION 'invalid supplier bill header';
  END IF;
  IF p_tax IS NULL OR p_tax::text IN ('NaN','Infinity','-Infinity') OR p_tax<>0 THEN
    RAISE EXCEPTION 'only zero-tax supplier bills are supported';
  END IF;
  IF upper(p_currency) IS DISTINCT FROM upper(v_currency) THEN
    RAISE EXCEPTION 'cross-currency supplier bill posting is unavailable; use entity functional currency';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines)<1 THEN
    RAISE EXCEPTION 'supplier bill requires at least one line';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.vendors WHERE id=p_vendor_id AND org_id=v_org_id) THEN
    RAISE EXCEPTION 'vendor is outside the organization';
  END IF;
  SELECT * INTO v_control FROM public.entity_supplier_bill_account_controls
  WHERE org_id=v_org_id AND entity_id=p_entity_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'entity supplier bill account control is not configured'; END IF;
  PERFORM 1 FROM public.accounts WHERE id=v_control.ap_account_id AND org_id=v_org_id
    AND account_type='liability' AND is_active=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'AP control account is inactive or invalid'; END IF;
  PERFORM 1 FROM public.accounts WHERE id=v_control.expense_account_id AND org_id=v_org_id
    AND account_type='expense' AND is_active=true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'expense control account is inactive or invalid'; END IF;
  SELECT id INTO v_period_id FROM public.accounting_periods
  WHERE org_id=v_org_id AND entity_id=p_entity_id
    AND p_issue_date BETWEEN period_start AND period_end AND status='OPEN' FOR UPDATE;
  IF v_period_id IS NULL THEN RAISE EXCEPTION 'an OPEN accounting period is required'; END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    BEGIN
      v_description:=v_line->>'description'; v_quantity:=(v_line->>'quantity')::numeric;
      v_unit_price:=(v_line->>'unit_price')::numeric;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'invalid supplier bill line'; END;
    IF v_description IS NULL OR btrim(v_description)='' OR v_description~'[[:cntrl:]]'
       OR v_quantity::text IN ('NaN','Infinity','-Infinity')
       OR v_unit_price::text IN ('NaN','Infinity','-Infinity')
       OR v_quantity<=0 OR v_unit_price<=0 OR round(v_quantity,4) IS DISTINCT FROM v_quantity
       OR round(v_unit_price,4) IS DISTINCT FROM v_unit_price THEN
      RAISE EXCEPTION 'invalid supplier bill line';
    END IF;
    v_line_total:=round(v_quantity*v_unit_price,2);
    IF v_line_total<=0 OR v_line_total::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'invalid supplier bill line total';
    END IF;
    v_subtotal:=v_subtotal+v_line_total;
  END LOOP;
  IF v_subtotal<=0 OR round(v_subtotal,2) IS DISTINCT FROM v_subtotal THEN
    RAISE EXCEPTION 'invalid supplier bill subtotal';
  END IF;
  PERFORM set_config('tapaano.accounting_write','trusted',true);
  PERFORM set_config('tapaano.supplier_bill_write','trusted',true);
  INSERT INTO public.accounting_events(
    org_id,entity_id,event_type,source_type,source_id,idempotency_key,payload_hash,actor_id
  ) VALUES(v_org_id,p_entity_id,'supplier_bill_posted','supplier_bill',v_bill_id,
    p_idempotency_key,v_payload_hash,v_actor) RETURNING id INTO v_event_id;
  INSERT INTO public.bills(
    id,org_id,entity_id,vendor_id,bill_number,issue_date,due_date,subtotal,tax,total,
    amount_paid,status,notes,currency,exchange_rate,functional_total,purchase_order_id,
    goods_receipt_id,match_status,tax_code_id,accounting_status,account_control_id,
    posted_at,posted_by
  ) VALUES(v_bill_id,v_org_id,p_entity_id,p_vendor_id,p_bill_number,p_issue_date,p_due_date,
    v_subtotal,0,v_subtotal,0,'pending',p_notes,upper(v_currency),1,v_subtotal,
    NULL,NULL,'unmatched',NULL,'POSTED',v_control.id,now(),v_actor);
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_line_number:=v_line_number+1; v_description:=btrim(v_line->>'description');
    v_quantity:=(v_line->>'quantity')::numeric; v_unit_price:=(v_line->>'unit_price')::numeric;
    v_line_total:=round(v_quantity*v_unit_price,2);
    INSERT INTO public.bill_lines(
      org_id,entity_id,bill_id,line_number,description,quantity,unit_price,line_total,expense_account_id
    ) VALUES(v_org_id,p_entity_id,v_bill_id,v_line_number,v_description,v_quantity,
      v_unit_price,v_line_total,v_control.expense_account_id);
  END LOOP;
  INSERT INTO public.journal_entries(
    org_id,entity_id,entry_number,entry_date,memo,status,created_by,posted_at,
    source_module,accounting_period_id,accounting_event_id
  ) VALUES(v_org_id,p_entity_id,'AP-'||left(p_bill_number,40)||'-'||left(md5(p_idempotency_key),8),
    p_issue_date,'Supplier bill '||p_bill_number,'posted',v_actor,now(),'ap',v_period_id,v_event_id)
  RETURNING id INTO v_journal_id;
  INSERT INTO public.journal_lines(
    journal_entry_id,account_id,debit,credit,memo,org_id,entity_id,line_number
  ) VALUES
    (v_journal_id,v_control.expense_account_id,v_subtotal,0,'Expense',v_org_id,p_entity_id,1),
    (v_journal_id,v_control.ap_account_id,0,v_subtotal,'Accounts payable',v_org_id,p_entity_id,2);
  UPDATE public.accounting_events SET journal_entry_id=v_journal_id WHERE id=v_event_id;
  UPDATE public.bills SET accounting_event_id=v_event_id,journal_entry_id=v_journal_id,
    updated_at=now() WHERE id=v_bill_id;
  PERFORM public.validate_supplier_bill_graph(v_bill_id);
  RETURN v_bill_id;
END;
$$;

DO $$ DECLARE bill_record record; BEGIN
  FOR bill_record IN SELECT id FROM public.bills LOOP
    PERFORM public.validate_supplier_bill_graph(bill_record.id);
  END LOOP;
END $$;

ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_supplier_bill_account_controls ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE target_table text; policy_record record; column_record record; role_name text;
  routine record; drop_kind text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['bills','bill_lines','entity_supplier_bill_account_controls'] LOOP
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
    WHERE n.nspname='public' AND p.proname IN('configure_entity_supplier_bill_accounts','post_supplier_bill') LOOP
    IF routine.prokind<>'f'
       OR (routine.proname='configure_entity_supplier_bill_accounts' AND routine.types<>'uuid, uuid, uuid, text')
       OR (routine.proname='post_supplier_bill' AND routine.types<>'uuid, uuid, text, date, date, text, numeric, text, jsonb, text') THEN
      drop_kind:=CASE WHEN routine.prokind='p' THEN 'PROCEDURE' ELSE 'FUNCTION' END;
      EXECUTE format('DROP %s %I.%I(%s)',drop_kind,routine.nspname,routine.proname,routine.args);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.validate_supplier_bill_graph(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.configure_entity_supplier_bill_accounts(uuid,uuid,uuid,text) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.post_supplier_bill(uuid,uuid,text,date,date,text,numeric,text,jsonb,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.configure_entity_supplier_bill_accounts(uuid,uuid,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.post_supplier_bill(uuid,uuid,text,date,date,text,numeric,text,jsonb,text) TO authenticated;

COMMIT;
