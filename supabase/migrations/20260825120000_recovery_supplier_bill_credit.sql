-- Controlled full supplier-bill credits for the verified zero-tax,
-- functional-currency bill boundary. Partial credits, refunds, payments,
-- matching, tax, and FX remain unavailable.

BEGIN;

LOCK TABLE public.bills, public.bill_lines, public.accounting_events,
  public.accounting_periods, public.journal_entries, public.journal_lines
  IN SHARE ROW EXCLUSIVE MODE;

CREATE UNIQUE INDEX IF NOT EXISTS bill_lines_supplier_credit_source_uidx
  ON public.bill_lines (org_id, entity_id, bill_id, id);

CREATE TABLE IF NOT EXISTS public.supplier_bill_credit_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  vendor_id uuid NOT NULL,
  original_bill_id uuid NOT NULL,
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
  CONSTRAINT supplier_bill_credit_notes_number_check CHECK (
    credit_note_number=btrim(credit_note_number)
    AND length(credit_note_number) BETWEEN 1 AND 80
    AND credit_note_number !~ '[[:cntrl:]]'
  ),
  CONSTRAINT supplier_bill_credit_notes_reason_check CHECK (
    reason=btrim(reason) AND length(reason) BETWEEN 1 AND 500
    AND reason !~ '[[:cntrl:]]'
  ),
  CONSTRAINT supplier_bill_credit_notes_currency_check CHECK (currency~'^[A-Z]{3}$'),
  CONSTRAINT supplier_bill_credit_notes_total_check CHECK (
    total::text NOT IN ('NaN','Infinity','-Infinity')
    AND total>0 AND round(total,2)=total
  ),
  CONSTRAINT supplier_bill_credit_notes_key_check CHECK (
    idempotency_key=btrim(idempotency_key)
    AND length(idempotency_key) BETWEEN 1 AND 160
    AND idempotency_key !~ '[[:cntrl:]]'
    AND payload_hash~'^[0-9a-f]{32}$'
  ),
  CONSTRAINT supplier_bill_credit_notes_org_bill_fkey
    FOREIGN KEY (org_id,entity_id,original_bill_id)
    REFERENCES public.bills(org_id,entity_id,id),
  CONSTRAINT supplier_bill_credit_notes_org_vendor_fkey
    FOREIGN KEY (org_id,vendor_id) REFERENCES public.vendors(org_id,id),
  CONSTRAINT supplier_bill_credit_notes_org_control_fkey
    FOREIGN KEY (org_id,account_control_id)
    REFERENCES public.entity_supplier_bill_account_controls(org_id,id),
  UNIQUE (org_id,credit_note_number),
  UNIQUE (org_id,idempotency_key),
  UNIQUE (original_bill_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_bill_credit_notes_org_entity_id_uidx
  ON public.supplier_bill_credit_notes (org_id,entity_id,id);

CREATE TABLE IF NOT EXISTS public.supplier_bill_credit_note_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  entity_id uuid NOT NULL,
  credit_note_id uuid NOT NULL,
  original_bill_id uuid NOT NULL,
  original_bill_line_id uuid NOT NULL,
  line_number integer NOT NULL,
  description text NOT NULL,
  quantity numeric(18,4) NOT NULL,
  unit_price numeric(18,4) NOT NULL,
  line_total numeric(15,2) NOT NULL,
  expense_account_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_bill_credit_note_lines_number_check CHECK (line_number>0),
  CONSTRAINT supplier_bill_credit_note_lines_description_check CHECK (
    description=btrim(description) AND length(description)>0
    AND description !~ '[[:cntrl:]]'
  ),
  CONSTRAINT supplier_bill_credit_note_lines_value_check CHECK (
    quantity::text NOT IN ('NaN','Infinity','-Infinity')
    AND unit_price::text NOT IN ('NaN','Infinity','-Infinity')
    AND line_total::text NOT IN ('NaN','Infinity','-Infinity')
    AND quantity>0 AND unit_price>0 AND line_total>0
    AND round(quantity,4)=quantity AND round(unit_price,4)=unit_price
    AND round(quantity*unit_price,2)=line_total
  ),
  CONSTRAINT supplier_bill_credit_note_lines_org_credit_fkey
    FOREIGN KEY (org_id,entity_id,credit_note_id)
    REFERENCES public.supplier_bill_credit_notes(org_id,entity_id,id),
  CONSTRAINT supplier_bill_credit_note_lines_org_bill_line_fkey
    FOREIGN KEY (org_id,entity_id,original_bill_id,original_bill_line_id)
    REFERENCES public.bill_lines(org_id,entity_id,bill_id,id),
  CONSTRAINT supplier_bill_credit_note_lines_org_expense_fkey
    FOREIGN KEY (org_id,expense_account_id) REFERENCES public.accounts(org_id,id),
  UNIQUE (credit_note_id,line_number),
  UNIQUE (credit_note_id,original_bill_line_id)
);

LOCK TABLE public.supplier_bill_credit_notes,
  public.supplier_bill_credit_note_lines IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE public.accounting_events DROP CONSTRAINT IF EXISTS accounting_events_type_check;
ALTER TABLE public.accounting_events ADD CONSTRAINT accounting_events_type_check CHECK (
  event_type IN (
    'manual_journal_posted','journal_reversed','customer_invoice_posted',
    'customer_credit_note_posted','customer_receipt_posted','supplier_bill_posted',
    'supplier_bill_credit_posted'
  )
);
ALTER TABLE public.accounting_events DROP CONSTRAINT IF EXISTS accounting_events_source_type_check;
ALTER TABLE public.accounting_events ADD CONSTRAINT accounting_events_source_type_check CHECK (
  source_type IN (
    'manual_journal','journal_reversal','customer_invoice','customer_credit_note',
    'customer_receipt','supplier_bill','supplier_bill_credit'
  )
);
ALTER TABLE public.accounting_events DROP CONSTRAINT IF EXISTS accounting_events_source_shape_check;
ALTER TABLE public.accounting_events ADD CONSTRAINT accounting_events_source_shape_check CHECK (
  (source_type='manual_journal' AND source_id IS NULL)
  OR (source_type IN (
    'journal_reversal','customer_invoice','customer_credit_note','customer_receipt',
    'supplier_bill','supplier_bill_credit'
  ) AND source_id IS NOT NULL)
);

CREATE OR REPLACE FUNCTION public.guard_supplier_bill_credit_write()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF current_setting('tapaano.supplier_bill_credit_write',true) IS DISTINCT FROM 'trusted' THEN
    RAISE EXCEPTION 'supplier credit is immutable; use the trusted full-credit workflow';
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
    ELSIF OLD.source_type='supplier_bill_credit'
       AND current_setting('tapaano.supplier_bill_credit_write',true) IS DISTINCT FROM 'trusted' THEN
      RAISE EXCEPTION 'supplier credit accounting event is immutable';
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
         AND current_setting('tapaano.supplier_bill_write',true) IS DISTINCT FROM 'trusted'
         AND current_setting('tapaano.supplier_bill_credit_write',true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'supplier bill journal is immutable';
      ELSIF v_source_type='supplier_bill_credit'
         AND current_setting('tapaano.supplier_bill_credit_write',true) IS DISTINCT FROM 'trusted' THEN
        RAISE EXCEPTION 'supplier credit journal is immutable';
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
  v_bill public.bills%ROWTYPE; v_control public.entity_supplier_bill_account_controls%ROWTYPE;
  v_event public.accounting_events%ROWTYPE; v_journal public.journal_entries%ROWTYPE;
  v_entity_currency text; v_ap_type public.account_type; v_expense_type public.account_type;
  v_line_count integer; v_line_total numeric; v_journal_count integer;
  v_debit numeric; v_credit numeric; v_expense_lines integer; v_ap_lines integer;
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
  SELECT account_type INTO v_ap_type FROM public.accounts WHERE id=v_control.ap_account_id AND org_id=v_bill.org_id;
  SELECT account_type INTO v_expense_type FROM public.accounts WHERE id=v_control.expense_account_id AND org_id=v_bill.org_id;
  IF v_control.id IS NULL OR v_ap_type IS DISTINCT FROM 'liability' OR v_expense_type IS DISTINCT FROM 'expense' THEN
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
     OR v_journal.accounting_period_id IS NULL OR v_journal.reversal_of_id IS NOT NULL
     OR (v_journal.reversed_by_id IS NOT NULL AND NOT EXISTS(
       SELECT 1 FROM public.supplier_bill_credit_notes credit
       WHERE credit.original_bill_id=v_bill.id AND credit.journal_entry_id=v_journal.reversed_by_id
     )) THEN
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

CREATE OR REPLACE FUNCTION public.validate_supplier_bill_credit_graph(p_credit_note_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_credit public.supplier_bill_credit_notes%ROWTYPE; v_bill public.bills%ROWTYPE;
  v_control public.entity_supplier_bill_account_controls%ROWTYPE;
  v_event public.accounting_events%ROWTYPE; v_journal public.journal_entries%ROWTYPE;
  v_original public.journal_entries%ROWTYPE; v_line_count integer; v_line_total numeric;
  v_bill_line_count integer; v_journal_count integer; v_debit numeric; v_credit_total numeric;
  v_ap_lines integer; v_expense_lines integer;
BEGIN
  SELECT * INTO v_credit FROM public.supplier_bill_credit_notes WHERE id=p_credit_note_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_credit.credit_note_number IS NULL OR v_credit.credit_note_number IS DISTINCT FROM btrim(v_credit.credit_note_number)
     OR v_credit.reason IS NULL OR v_credit.reason IS DISTINCT FROM btrim(v_credit.reason)
     OR v_credit.issue_date IS NULL OR v_credit.total::text IN ('NaN','Infinity','-Infinity')
     OR v_credit.total<=0 OR round(v_credit.total,2) IS DISTINCT FROM v_credit.total
     OR v_credit.account_control_id IS NULL OR v_credit.accounting_event_id IS NULL
     OR v_credit.journal_entry_id IS NULL OR v_credit.posted_by IS NULL THEN
    RAISE EXCEPTION 'supplier credit header is not canonical';
  END IF;
  SELECT * INTO v_bill FROM public.bills WHERE id=v_credit.original_bill_id;
  IF NOT FOUND OR v_bill.org_id IS DISTINCT FROM v_credit.org_id
     OR v_bill.entity_id IS DISTINCT FROM v_credit.entity_id
     OR v_bill.vendor_id IS DISTINCT FROM v_credit.vendor_id
     OR v_bill.account_control_id IS DISTINCT FROM v_credit.account_control_id
     OR v_bill.total IS DISTINCT FROM v_credit.total
     OR upper(v_bill.currency) IS DISTINCT FROM upper(v_credit.currency)
     OR v_credit.issue_date<v_bill.issue_date THEN
    RAISE EXCEPTION 'supplier credit original bill graph is invalid';
  END IF;
  PERFORM public.validate_supplier_bill_graph(v_bill.id);
  SELECT * INTO v_control FROM public.entity_supplier_bill_account_controls WHERE id=v_credit.account_control_id;
  SELECT * INTO v_event FROM public.accounting_events WHERE id=v_credit.accounting_event_id;
  IF NOT FOUND OR v_event.org_id IS DISTINCT FROM v_credit.org_id
     OR v_event.entity_id IS DISTINCT FROM v_credit.entity_id
     OR v_event.event_type IS DISTINCT FROM 'supplier_bill_credit_posted'
     OR v_event.source_type IS DISTINCT FROM 'supplier_bill_credit'
     OR v_event.source_id IS DISTINCT FROM v_credit.id
     OR v_event.journal_entry_id IS DISTINCT FROM v_credit.journal_entry_id
     OR v_event.actor_id IS DISTINCT FROM v_credit.posted_by THEN
    RAISE EXCEPTION 'supplier credit event graph is invalid';
  END IF;
  SELECT * INTO v_journal FROM public.journal_entries WHERE id=v_credit.journal_entry_id;
  SELECT * INTO v_original FROM public.journal_entries WHERE id=v_bill.journal_entry_id;
  IF v_journal.id IS NULL OR v_original.id IS NULL
     OR v_journal.org_id IS DISTINCT FROM v_credit.org_id
     OR v_journal.entity_id IS DISTINCT FROM v_credit.entity_id
     OR v_journal.status::text IS DISTINCT FROM 'posted'
     OR v_journal.source_module IS DISTINCT FROM 'ap_credit'
     OR v_journal.entry_date IS DISTINCT FROM v_credit.issue_date
     OR v_journal.accounting_event_id IS DISTINCT FROM v_credit.accounting_event_id
     OR v_journal.created_by IS DISTINCT FROM v_credit.posted_by
     OR v_journal.accounting_period_id IS NULL
     OR v_journal.reversal_of_id IS DISTINCT FROM v_original.id
     OR v_journal.reversed_by_id IS NOT NULL
     OR v_original.reversed_by_id IS DISTINCT FROM v_journal.id THEN
    RAISE EXCEPTION 'supplier credit journal graph is invalid';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounting_periods period
    WHERE period.id=v_journal.accounting_period_id AND period.org_id=v_credit.org_id
      AND period.entity_id=v_credit.entity_id
      AND v_credit.issue_date BETWEEN period.period_start AND period.period_end) THEN
    RAISE EXCEPTION 'supplier credit period graph is invalid';
  END IF;
  SELECT count(*),COALESCE(sum(line_total),0) INTO v_line_count,v_line_total
  FROM public.supplier_bill_credit_note_lines WHERE credit_note_id=v_credit.id;
  SELECT count(*) INTO v_bill_line_count FROM public.bill_lines WHERE bill_id=v_bill.id;
  IF v_line_count IS DISTINCT FROM v_bill_line_count OR v_line_count<1
     OR v_line_total IS DISTINCT FROM v_credit.total
     OR EXISTS(SELECT 1 FROM public.supplier_bill_credit_note_lines credit_line
       JOIN public.bill_lines bill_line ON bill_line.id=credit_line.original_bill_line_id
       WHERE credit_line.credit_note_id=v_credit.id AND (
         credit_line.org_id IS DISTINCT FROM bill_line.org_id
         OR credit_line.entity_id IS DISTINCT FROM bill_line.entity_id
         OR credit_line.original_bill_id IS DISTINCT FROM bill_line.bill_id
         OR credit_line.line_number IS DISTINCT FROM bill_line.line_number
         OR credit_line.description IS DISTINCT FROM bill_line.description
         OR credit_line.quantity IS DISTINCT FROM bill_line.quantity
         OR credit_line.unit_price IS DISTINCT FROM bill_line.unit_price
         OR credit_line.line_total IS DISTINCT FROM bill_line.line_total
         OR credit_line.expense_account_id IS DISTINCT FROM bill_line.expense_account_id
       )) THEN
    RAISE EXCEPTION 'supplier credit lines do not exactly copy bill evidence';
  END IF;
  SELECT count(*),COALESCE(sum(debit),0),COALESCE(sum(credit),0),
    count(*) FILTER(WHERE account_id=v_control.ap_account_id AND debit=v_credit.total AND credit=0),
    count(*) FILTER(WHERE account_id=v_control.expense_account_id AND credit=v_credit.total AND debit=0)
  INTO v_journal_count,v_debit,v_credit_total,v_ap_lines,v_expense_lines
  FROM public.journal_lines WHERE journal_entry_id=v_journal.id;
  IF v_journal_count IS DISTINCT FROM 2 OR v_debit IS DISTINCT FROM v_credit.total
     OR v_credit_total IS DISTINCT FROM v_credit.total OR v_ap_lines IS DISTINCT FROM 1
     OR v_expense_lines IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'supplier credit journal lines do not reconcile';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_supplier_bill_credit_trigger()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
DECLARE v_credit_id uuid;
BEGIN
  IF TG_TABLE_NAME='supplier_bill_credit_notes' THEN
    IF TG_OP='DELETE' THEN v_credit_id:=OLD.id; ELSE v_credit_id:=NEW.id; END IF;
  ELSE
    IF TG_OP='DELETE' THEN v_credit_id:=OLD.credit_note_id; ELSE v_credit_id:=NEW.credit_note_id; END IF;
  END IF;
  PERFORM public.validate_supplier_bill_credit_graph(v_credit_id);
  RETURN NULL;
END;
$$;

DO $$ DECLARE target_table text; BEGIN
  FOREACH target_table IN ARRAY ARRAY['supplier_bill_credit_notes','supplier_bill_credit_note_lines'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS guard_supplier_credit_write ON public.%I',target_table);
    EXECUTE format('CREATE TRIGGER guard_supplier_credit_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_supplier_bill_credit_write()',target_table);
    EXECUTE format('DROP TRIGGER IF EXISTS guard_supplier_credit_truncate ON public.%I',target_table);
    EXECUTE format('CREATE TRIGGER guard_supplier_credit_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_supplier_bill_credit_write()',target_table);
    EXECUTE format('DROP TRIGGER IF EXISTS validate_supplier_credit_deferred ON public.%I',target_table);
    EXECUTE format('CREATE CONSTRAINT TRIGGER validate_supplier_credit_deferred AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.validate_supplier_bill_credit_trigger()',target_table);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS guard_invoice_events_graph ON public.accounting_events;
CREATE TRIGGER guard_invoice_events_graph BEFORE UPDATE OR DELETE ON public.accounting_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_accounting_graph();
DROP TRIGGER IF EXISTS guard_invoice_journals_graph ON public.journal_entries;
CREATE TRIGGER guard_invoice_journals_graph BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.guard_invoice_accounting_graph();

CREATE OR REPLACE FUNCTION public.post_supplier_bill_credit(
  p_bill_id uuid,p_credit_note_number text,p_credit_date date,
  p_reason text,p_idempotency_key text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,auth AS $$
DECLARE
  v_org_id uuid; v_actor uuid; v_bill public.bills%ROWTYPE;
  v_original public.journal_entries%ROWTYPE; v_control public.entity_supplier_bill_account_controls%ROWTYPE;
  v_period_id uuid; v_credit_id uuid:=gen_random_uuid(); v_event_id uuid; v_journal_id uuid;
  v_existing_id uuid; v_existing_bill_id uuid; v_existing_hash text; v_payload_hash text;
BEGIN
  v_org_id:=public.get_user_org_id();
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'accounting actor identity is unavailable'; END IF;
  v_actor:=public.assert_accounting_actor(v_org_id);
  IF p_credit_note_number IS NULL OR p_credit_note_number IS DISTINCT FROM btrim(p_credit_note_number)
     OR length(p_credit_note_number) NOT BETWEEN 1 AND 80 OR p_credit_note_number~'[[:cntrl:]]'
     OR p_reason IS NULL OR p_reason IS DISTINCT FROM btrim(p_reason)
     OR length(p_reason) NOT BETWEEN 1 AND 500 OR p_reason~'[[:cntrl:]]'
     OR p_credit_date IS NULL OR p_idempotency_key IS NULL
     OR p_idempotency_key IS DISTINCT FROM btrim(p_idempotency_key)
     OR length(p_idempotency_key) NOT BETWEEN 1 AND 160 OR p_idempotency_key~'[[:cntrl:]]' THEN
    RAISE EXCEPTION 'invalid supplier credit request';
  END IF;
  v_payload_hash:=md5(jsonb_build_object('bill_id',p_bill_id,
    'credit_note_number',p_credit_note_number,'credit_date',p_credit_date,
    'reason',p_reason)::text);
  LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.accounting_events IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.bills IN SHARE ROW EXCLUSIVE MODE;
  LOCK TABLE public.supplier_bill_credit_notes IN SHARE ROW EXCLUSIVE MODE;
  SELECT id,original_bill_id,payload_hash INTO v_existing_id,v_existing_bill_id,v_existing_hash
  FROM public.supplier_bill_credit_notes WHERE org_id=v_org_id AND idempotency_key=p_idempotency_key;
  IF v_existing_id IS NOT NULL THEN
    IF v_existing_bill_id IS DISTINCT FROM p_bill_id OR v_existing_hash IS DISTINCT FROM v_payload_hash THEN
      RAISE EXCEPTION 'supplier credit idempotency key conflicts with another payload';
    END IF;
    PERFORM public.validate_supplier_bill_credit_graph(v_existing_id);
    RETURN v_existing_id;
  END IF;
  SELECT * INTO v_bill FROM public.bills
  WHERE id=p_bill_id AND org_id=v_org_id AND accounting_status='POSTED'
    AND journal_entry_id IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'posted supplier bill not found or unavailable'; END IF;
  IF p_credit_date<v_bill.issue_date THEN RAISE EXCEPTION 'supplier credit date cannot precede bill date'; END IF;
  IF EXISTS(SELECT 1 FROM public.supplier_bill_credit_notes WHERE original_bill_id=v_bill.id) THEN
    RAISE EXCEPTION 'supplier bill already has a full supplier credit';
  END IF;
  PERFORM public.validate_supplier_bill_graph(v_bill.id);
  SELECT * INTO v_original FROM public.journal_entries WHERE id=v_bill.journal_entry_id FOR UPDATE;
  IF v_original.id IS NULL OR v_original.status::text IS DISTINCT FROM 'posted'
     OR v_original.reversal_of_id IS NOT NULL OR v_original.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION 'supplier bill journal is unavailable for full credit';
  END IF;
  SELECT * INTO v_control FROM public.entity_supplier_bill_account_controls
  WHERE id=v_bill.account_control_id AND org_id=v_org_id AND entity_id=v_bill.entity_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'supplier bill account control is unavailable'; END IF;
  SELECT id INTO v_period_id FROM public.accounting_periods
  WHERE org_id=v_org_id AND entity_id=v_bill.entity_id
    AND p_credit_date BETWEEN period_start AND period_end AND status='OPEN' FOR UPDATE;
  IF v_period_id IS NULL THEN RAISE EXCEPTION 'an OPEN accounting period is required'; END IF;
  PERFORM set_config('tapaano.accounting_write','trusted',true);
  PERFORM set_config('tapaano.supplier_bill_write','trusted',true);
  PERFORM set_config('tapaano.supplier_bill_credit_write','trusted',true);
  INSERT INTO public.accounting_events(
    org_id,entity_id,event_type,source_type,source_id,idempotency_key,payload_hash,actor_id
  ) VALUES(v_org_id,v_bill.entity_id,'supplier_bill_credit_posted','supplier_bill_credit',
    v_credit_id,p_idempotency_key,v_payload_hash,v_actor) RETURNING id INTO v_event_id;
  INSERT INTO public.journal_entries(
    org_id,entity_id,entry_number,entry_date,memo,status,created_by,posted_at,
    source_module,accounting_period_id,accounting_event_id,reversal_of_id
  ) VALUES(v_org_id,v_bill.entity_id,
    'VC-'||left(p_credit_note_number,40)||'-'||left(md5(p_idempotency_key),8),
    p_credit_date,'Supplier credit '||p_credit_note_number||': '||p_reason,
    'posted',v_actor,now(),'ap_credit',v_period_id,v_event_id,v_original.id)
  RETURNING id INTO v_journal_id;
  INSERT INTO public.journal_lines(
    journal_entry_id,account_id,debit,credit,memo,org_id,entity_id,line_number
  ) VALUES
    (v_journal_id,v_control.ap_account_id,v_bill.total,0,'Reverse accounts payable',v_org_id,v_bill.entity_id,1),
    (v_journal_id,v_control.expense_account_id,0,v_bill.total,'Reverse expense',v_org_id,v_bill.entity_id,2);
  INSERT INTO public.supplier_bill_credit_notes(
    id,org_id,entity_id,vendor_id,original_bill_id,credit_note_number,issue_date,
    currency,total,reason,account_control_id,accounting_event_id,journal_entry_id,
    idempotency_key,payload_hash,posted_by,posted_at
  ) VALUES(v_credit_id,v_org_id,v_bill.entity_id,v_bill.vendor_id,v_bill.id,
    p_credit_note_number,p_credit_date,upper(v_bill.currency),v_bill.total,p_reason,
    v_bill.account_control_id,v_event_id,v_journal_id,p_idempotency_key,v_payload_hash,v_actor,now());
  INSERT INTO public.supplier_bill_credit_note_lines(
    org_id,entity_id,credit_note_id,original_bill_id,original_bill_line_id,
    line_number,description,quantity,unit_price,line_total,expense_account_id
  ) SELECT org_id,entity_id,v_credit_id,bill_id,id,line_number,description,
    quantity,unit_price,line_total,expense_account_id
  FROM public.bill_lines WHERE bill_id=v_bill.id ORDER BY line_number;
  UPDATE public.accounting_events SET journal_entry_id=v_journal_id WHERE id=v_event_id;
  UPDATE public.journal_entries SET reversed_by_id=v_journal_id WHERE id=v_original.id;
  PERFORM public.validate_supplier_bill_credit_graph(v_credit_id);
  RETURN v_credit_id;
END;
$$;

DO $$ DECLARE credit_record record; BEGIN
  FOR credit_record IN SELECT id FROM public.supplier_bill_credit_notes LOOP
    PERFORM public.validate_supplier_bill_credit_graph(credit_record.id);
  END LOOP;
END $$;

ALTER TABLE public.supplier_bill_credit_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_bill_credit_note_lines ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE target_table text; policy_record record; column_record record;
  role_name text; routine record; drop_kind text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY['supplier_bill_credit_notes','supplier_bill_credit_note_lines'] LOOP
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
    WHERE n.nspname='public' AND p.proname='post_supplier_bill_credit' LOOP
    IF routine.prokind<>'f' OR routine.types<>'uuid, text, date, text, text' THEN
      drop_kind:=CASE WHEN routine.prokind='p' THEN 'PROCEDURE' ELSE 'FUNCTION' END;
      EXECUTE format('DROP %s %I.%I(%s)',drop_kind,routine.nspname,routine.proname,routine.args);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.validate_supplier_bill_credit_graph(uuid)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.post_supplier_bill_credit(uuid,text,date,text,text)
  FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.post_supplier_bill_credit(uuid,text,date,text,text)
  TO authenticated;

COMMIT;
