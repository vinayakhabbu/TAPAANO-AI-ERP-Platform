BEGIN;
LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
ALTER TABLE public.customer_receipts DROP CONSTRAINT IF EXISTS customer_receipts_invoice_id_key;
ALTER TABLE public.supplier_payments DROP CONSTRAINT IF EXISTS supplier_payments_bill_id_key;
CREATE INDEX IF NOT EXISTS customer_receipts_invoice_date_idx ON public.customer_receipts(invoice_id,receipt_date,id);
CREATE INDEX IF NOT EXISTS supplier_payments_bill_date_idx ON public.supplier_payments(bill_id,payment_date,id);

-- Private invariant shared by original settlements, corrections and replacements.
-- Posting RPCs serialize on journal_entries before reading or changing capacity.
-- Group by accounting date: every historical day-end must remain within [0,total].
CREATE OR REPLACE FUNCTION public.validate_settlement_capacity(p_kind text,p_document_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_total numeric; v_invalid boolean;
BEGIN
  IF p_kind='ar' THEN
    SELECT total INTO v_total FROM public.invoices WHERE id=p_document_id;
    WITH movements AS (
      SELECT receipt_date AS day,amount AS delta FROM public.customer_receipts WHERE invoice_id=p_document_id
      UNION ALL SELECT c.correction_date,-c.amount FROM public.customer_receipt_corrections c
        JOIN public.customer_receipts r ON r.id=c.original_receipt_id WHERE r.invoice_id=p_document_id
      UNION ALL SELECT replacement_date,amount FROM public.customer_receipt_replacements WHERE invoice_id=p_document_id
    ), daily AS (SELECT day,sum(delta) AS delta FROM movements GROUP BY day), balances AS (
      SELECT day,sum(delta) OVER(ORDER BY day ROWS UNBOUNDED PRECEDING) AS settled FROM daily
    ) SELECT COALESCE(bool_or(day<DATE '0001-01-01' OR day>DATE '9999-12-31' OR settled<0 OR settled>v_total),false) INTO v_invalid FROM balances;
  ELSIF p_kind='ap' THEN
    SELECT total INTO v_total FROM public.bills WHERE id=p_document_id;
    WITH movements AS (
      SELECT payment_date AS day,amount AS delta FROM public.supplier_payments WHERE bill_id=p_document_id
      UNION ALL SELECT c.correction_date,-c.amount FROM public.supplier_payment_corrections c
        JOIN public.supplier_payments p ON p.id=c.original_payment_id WHERE p.bill_id=p_document_id
      UNION ALL SELECT replacement_date,amount FROM public.supplier_payment_replacements WHERE bill_id=p_document_id
    ), daily AS (SELECT day,sum(delta) AS delta FROM movements GROUP BY day), balances AS (
      SELECT day,sum(delta) OVER(ORDER BY day ROWS UNBOUNDED PRECEDING) AS settled FROM daily
    ) SELECT COALESCE(bool_or(day<DATE '0001-01-01' OR day>DATE '9999-12-31' OR settled<0 OR settled>v_total),false) INTO v_invalid FROM balances;
  ELSE RAISE EXCEPTION 'invalid settlement kind'; END IF;
  IF v_total IS NULL OR v_invalid THEN RAISE EXCEPTION 'settlements exceed the document balance at an effective date'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.validate_settlement_capacity(text,uuid) FROM PUBLIC,anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION public.validate_customer_receipt_graph(p_receipt_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
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
     OR v_receipt.amount > v_invoice.total
     OR v_receipt.receipt_date < v_invoice.issue_date
     OR EXISTS (SELECT 1 FROM public.customer_credit_notes
       WHERE original_invoice_id = v_invoice.id) THEN
    RAISE EXCEPTION 'customer receipt does not match its invoice or exceeds its total';
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
  PERFORM public.validate_settlement_capacity('ar',v_invoice.id);
END;
$$;

REVOKE ALL ON FUNCTION public.validate_customer_receipt_graph(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.validate_supplier_payment_graph(p_payment_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_payment public.supplier_payments%ROWTYPE;
  v_bill public.bills%ROWTYPE;
  v_control public.entity_supplier_payment_controls%ROWTYPE;
  v_bill_control public.entity_supplier_bill_account_controls%ROWTYPE;
  v_event public.accounting_events%ROWTYPE;
  v_journal public.journal_entries%ROWTYPE;
  v_cash_type public.account_type;
  v_ap_type public.account_type;
  v_correction_journal_id uuid;
  v_journal_count integer;
  v_debit numeric;
  v_credit numeric;
  v_ap_lines integer;
  v_cash_lines integer;
BEGIN
  SELECT * INTO v_payment FROM public.supplier_payments WHERE id = p_payment_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_payment.payment_number IS NULL
     OR v_payment.payment_number IS DISTINCT FROM btrim(v_payment.payment_number)
     OR v_payment.payment_reference IS NULL
     OR v_payment.payment_reference IS DISTINCT FROM btrim(v_payment.payment_reference)
     OR v_payment.payment_date IS NULL
     OR v_payment.amount::text IN ('NaN', 'Infinity', '-Infinity')
     OR v_payment.amount <= 0
     OR round(v_payment.amount, 2) IS DISTINCT FROM v_payment.amount
     OR v_payment.account_control_id IS NULL
     OR v_payment.accounting_event_id IS NULL
     OR v_payment.journal_entry_id IS NULL OR v_payment.posted_by IS NULL THEN
    RAISE EXCEPTION 'supplier payment header is not canonical';
  END IF;
  SELECT * INTO v_bill FROM public.bills WHERE id = v_payment.bill_id;
  IF NOT FOUND OR v_bill.org_id IS DISTINCT FROM v_payment.org_id
     OR v_bill.entity_id IS DISTINCT FROM v_payment.entity_id
     OR v_bill.vendor_id IS DISTINCT FROM v_payment.vendor_id
     OR v_bill.accounting_status IS DISTINCT FROM 'POSTED'
     OR v_payment.amount > v_bill.total
     OR upper(v_bill.currency) IS DISTINCT FROM upper(v_payment.currency)
     OR v_payment.payment_date < v_bill.issue_date
     OR EXISTS (SELECT 1 FROM public.supplier_bill_credit_notes credit
       WHERE credit.original_bill_id = v_bill.id) THEN
    RAISE EXCEPTION 'supplier payment bill graph is invalid';
  END IF;
  PERFORM public.validate_supplier_bill_graph(v_bill.id);
  SELECT * INTO v_control FROM public.entity_supplier_payment_controls
  WHERE id = v_payment.account_control_id AND org_id = v_payment.org_id
    AND entity_id = v_payment.entity_id;
  SELECT * INTO v_bill_control FROM public.entity_supplier_bill_account_controls
  WHERE id = v_control.supplier_bill_account_control_id;
  SELECT account_type INTO v_cash_type FROM public.accounts
  WHERE id = v_control.cash_account_id AND org_id = v_payment.org_id;
  SELECT account_type INTO v_ap_type FROM public.accounts
  WHERE id = v_control.ap_account_id AND org_id = v_payment.org_id;
  IF v_control.id IS NULL OR v_bill_control.id IS NULL
     OR v_control.supplier_bill_account_control_id IS DISTINCT FROM v_bill.account_control_id
     OR v_control.ap_account_id IS DISTINCT FROM v_bill_control.ap_account_id
     OR v_cash_type IS DISTINCT FROM 'asset' OR v_ap_type IS DISTINCT FROM 'liability' THEN
    RAISE EXCEPTION 'supplier payment account control is invalid';
  END IF;
  SELECT * INTO v_event FROM public.accounting_events WHERE id = v_payment.accounting_event_id;
  IF NOT FOUND OR v_event.org_id IS DISTINCT FROM v_payment.org_id
     OR v_event.entity_id IS DISTINCT FROM v_payment.entity_id
     OR v_event.event_type IS DISTINCT FROM 'supplier_payment_posted'
     OR v_event.source_type IS DISTINCT FROM 'supplier_payment'
     OR v_event.source_id IS DISTINCT FROM v_payment.id
     OR v_event.journal_entry_id IS DISTINCT FROM v_payment.journal_entry_id
     OR v_event.idempotency_key IS DISTINCT FROM v_payment.idempotency_key
     OR v_event.payload_hash IS DISTINCT FROM v_payment.payload_hash
     OR v_event.actor_id IS DISTINCT FROM v_payment.posted_by THEN
    RAISE EXCEPTION 'supplier payment event graph is invalid';
  END IF;
  SELECT * INTO v_journal FROM public.journal_entries WHERE id = v_payment.journal_entry_id;
  IF NOT FOUND OR v_journal.org_id IS DISTINCT FROM v_payment.org_id
     OR v_journal.entity_id IS DISTINCT FROM v_payment.entity_id
     OR v_journal.status::text IS DISTINCT FROM 'posted'
     OR v_journal.source_module IS DISTINCT FROM 'ap_payment'
     OR v_journal.entry_date IS DISTINCT FROM v_payment.payment_date
     OR v_journal.accounting_event_id IS DISTINCT FROM v_payment.accounting_event_id
     OR v_journal.created_by IS DISTINCT FROM v_payment.posted_by
     OR v_journal.accounting_period_id IS NULL
     OR v_journal.reversal_of_id IS NOT NULL THEN
    RAISE EXCEPTION 'supplier payment journal graph is invalid';
  END IF;
  SELECT journal_entry_id INTO v_correction_journal_id
  FROM public.supplier_payment_corrections
  WHERE original_payment_id = v_payment.id;
  IF v_journal.reversed_by_id IS DISTINCT FROM v_correction_journal_id THEN
    RAISE EXCEPTION 'supplier payment correction lineage is invalid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounting_periods period
    WHERE period.id = v_journal.accounting_period_id
      AND period.org_id = v_payment.org_id AND period.entity_id = v_payment.entity_id
      AND v_payment.payment_date BETWEEN period.period_start AND period.period_end) THEN
    RAISE EXCEPTION 'supplier payment period graph is invalid';
  END IF;
  SELECT count(*), COALESCE(sum(debit), 0), COALESCE(sum(credit), 0),
    count(*) FILTER (WHERE account_id = v_control.ap_account_id
      AND debit = v_payment.amount AND credit = 0),
    count(*) FILTER (WHERE account_id = v_control.cash_account_id
      AND credit = v_payment.amount AND debit = 0)
  INTO v_journal_count, v_debit, v_credit, v_ap_lines, v_cash_lines
  FROM public.journal_lines WHERE journal_entry_id = v_journal.id;
  IF v_journal_count IS DISTINCT FROM 2
     OR v_debit IS DISTINCT FROM v_payment.amount
     OR v_credit IS DISTINCT FROM v_payment.amount
     OR v_ap_lines IS DISTINCT FROM 1 OR v_cash_lines IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'supplier payment journal lines do not reconcile';
  END IF;
  PERFORM public.validate_settlement_capacity('ap',v_bill.id);
END;
$$;

REVOKE ALL ON FUNCTION public.validate_supplier_payment_graph(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.post_customer_receipt_amount(
  p_invoice_id uuid,
  p_receipt_number text,
  p_receipt_date date,
  p_currency text,
  p_reference text,
  p_idempotency_key text, p_amount numeric
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
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
  IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity')
    OR p_amount<=0 OR p_amount>9999999999999.99 OR round(p_amount,2)<>p_amount
    OR p_receipt_date IS NULL OR p_receipt_date<DATE '0001-01-01' OR p_receipt_date>DATE '9999-12-31' THEN
    RAISE EXCEPTION 'invalid settlement amount or date';
  END IF;
  p_amount:=round(p_amount,2);
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
    RAISE EXCEPTION 'invalid customer receipt request';
  END IF;

  v_payload_hash := md5(jsonb_build_object(
    'invoice_id', p_invoice_id,
    'receipt_number', p_receipt_number,
    'receipt_date', p_receipt_date,
    'currency', upper(p_currency),
    'reference', p_reference, 'amount',p_amount, 'workflow','amount'
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
    (v_journal_id, v_control.cash_account_id, p_amount, 0,
      'Manual customer receipt', v_invoice.org_id, v_invoice.entity_id, 1),
    (v_journal_id, v_control.ar_account_id, 0, p_amount,
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
    p_amount, p_reference, v_control.id, v_event_id, v_journal_id,
    p_idempotency_key, v_payload_hash, v_actor, now()
  );

  PERFORM public.validate_customer_receipt_graph(v_receipt_id);
  RETURN v_receipt_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_customer_receipt_amount(uuid,text,date,text,text,text,numeric) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.post_customer_receipt_amount(uuid,text,date,text,text,text,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.post_supplier_payment_amount(
  p_bill_id uuid,p_payment_number text,p_payment_date date,p_currency text,
  p_reference text,p_idempotency_key text, p_amount numeric
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''  AS $$
DECLARE
  v_org_id uuid; v_actor uuid; v_bill public.bills%ROWTYPE;
  v_control public.entity_supplier_payment_controls%ROWTYPE;
  v_period_id uuid; v_payment_id uuid:=gen_random_uuid(); v_event_id uuid; v_journal_id uuid;
  v_existing_id uuid; v_existing_bill_id uuid; v_existing_hash text; v_payload_hash text;
BEGIN
  IF p_amount IS NULL OR p_amount::text IN ('NaN','Infinity','-Infinity')
    OR p_amount<=0 OR p_amount>9999999999999.99 OR round(p_amount,2)<>p_amount
    OR p_payment_date IS NULL OR p_payment_date<DATE '0001-01-01' OR p_payment_date>DATE '9999-12-31' THEN
    RAISE EXCEPTION 'invalid settlement amount or date';
  END IF;
  p_amount:=round(p_amount,2);
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
    'payment_date',p_payment_date,'currency',upper(p_currency),'reference',p_reference,'amount',p_amount,'workflow','amount')::text);
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
    (v_journal_id,v_control.ap_account_id,p_amount,0,'Settle accounts payable',v_org_id,v_bill.entity_id,1),
    (v_journal_id,v_control.cash_account_id,0,p_amount,'Cash clearing',v_org_id,v_bill.entity_id,2);
  INSERT INTO public.supplier_payments(
    id,org_id,entity_id,vendor_id,bill_id,payment_number,payment_date,currency,
    amount,payment_reference,account_control_id,accounting_event_id,journal_entry_id,
    idempotency_key,payload_hash,posted_by,posted_at
  ) VALUES(v_payment_id,v_org_id,v_bill.entity_id,v_bill.vendor_id,v_bill.id,
    p_payment_number,p_payment_date,upper(v_bill.currency),p_amount,p_reference,
    v_control.id,v_event_id,v_journal_id,p_idempotency_key,v_payload_hash,v_actor,now());
  UPDATE public.accounting_events SET journal_entry_id=v_journal_id WHERE id=v_event_id;
  PERFORM public.validate_supplier_payment_graph(v_payment_id);
  RETURN v_payment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.post_supplier_payment_amount(uuid,text,date,text,text,text,numeric) FROM PUBLIC,anon,authenticated,service_role;

GRANT EXECUTE ON FUNCTION public.post_supplier_payment_amount(uuid,text,date,text,text,text,numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_subledger_aging(
  p_entity_id uuid, p_kind text, p_as_of date, p_offset integer DEFAULT 0,
  p_page_size integer DEFAULT 100, p_expected_revision text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE
  v_org uuid:=public.get_user_org_id(); v_trial jsonb; v_control uuid; v_account uuid;
  v_account_code text; v_account_name text; v_drafts bigint; v_count bigint;
  v_rows jsonb; v_result jsonb; v_invalid boolean; v_open_count bigint;
  v_ledger numeric; v_outstanding numeric; v_totals jsonb; v_revision text;
BEGIN
  v_trial:=public.get_entity_trial_balance(p_entity_id,p_as_of,p_as_of);
  IF p_kind IS NULL OR p_kind NOT IN ('ar','ap') THEN RAISE EXCEPTION 'invalid subledger'; END IF;
  IF p_offset IS NULL OR p_offset<0 OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'invalid aging page';
  END IF;
  IF p_offset>0 AND p_expected_revision IS NULL THEN RAISE EXCEPTION 'a report revision is required for subsequent pages'; END IF;
  IF p_kind='ar' THEN
    SELECT c.id,a.id,a.code,a.name INTO v_control,v_account,v_account_code,v_account_name
    FROM public.entity_invoice_account_controls c JOIN public.accounts a ON a.id=c.ar_account_id AND a.org_id=v_org AND a.account_type='asset'
    WHERE c.org_id=v_org AND c.entity_id=p_entity_id;
    IF EXISTS(SELECT 1 FROM public.invoices WHERE org_id=v_org AND entity_id=p_entity_id AND issue_date<=p_as_of
      AND accounting_status<>'POSTED' AND status<>'draft') THEN RAISE EXCEPTION 'unverified invoice history prevents aging'; END IF;
    SELECT count(*) INTO v_drafts FROM public.invoices WHERE org_id=v_org AND entity_id=p_entity_id AND issue_date<=p_as_of AND accounting_status<>'POSTED';
  ELSE
    SELECT c.id,a.id,a.code,a.name INTO v_control,v_account,v_account_code,v_account_name
    FROM public.entity_supplier_bill_account_controls c JOIN public.accounts a ON a.id=c.ap_account_id AND a.org_id=v_org AND a.account_type='liability'
    WHERE c.org_id=v_org AND c.entity_id=p_entity_id;
    IF EXISTS(SELECT 1 FROM public.bills WHERE org_id=v_org AND entity_id=p_entity_id AND issue_date<=p_as_of
      AND accounting_status<>'POSTED' AND status<>'draft') THEN RAISE EXCEPTION 'unverified bill history prevents aging'; END IF;
    SELECT count(*) INTO v_drafts FROM public.bills WHERE org_id=v_org AND entity_id=p_entity_id AND issue_date<=p_as_of AND accounting_status<>'POSTED';
  END IF;
  IF v_control IS NULL THEN RAISE EXCEPTION 'subledger posting accounts are not configured'; END IF;
  SELECT (value->>'closingDebit')::numeric-(value->>'closingCredit')::numeric INTO v_ledger
    FROM jsonb_array_elements(v_trial->'rows') WHERE value->>'accountId'=v_account::text;
  v_ledger:=COALESCE(v_ledger,0)*CASE WHEN p_kind='ar' THEN 1 ELSE -1 END;

  WITH documents AS (
    SELECT i.id,i.customer_id AS party_id,c.name AS party_name,i.invoice_number AS number,
      i.issue_date,i.due_date,i.currency,i.total,i.account_control_id,i.accounting_event_id,i.journal_entry_id,
      'customer_invoice'::text AS source_type
    FROM public.invoices i LEFT JOIN public.customers c ON c.id=i.customer_id AND c.org_id=v_org
    WHERE p_kind='ar' AND i.org_id=v_org AND i.entity_id=p_entity_id AND i.accounting_status='POSTED' AND i.issue_date<=p_as_of
    UNION ALL
    SELECT b.id,b.vendor_id,c.name,b.bill_number,b.issue_date,b.due_date,b.currency,b.total,b.account_control_id,b.accounting_event_id,b.journal_entry_id,'supplier_bill'
    FROM public.bills b LEFT JOIN public.vendors c ON c.id=b.vendor_id AND c.org_id=v_org
    WHERE p_kind='ap' AND b.org_id=v_org AND b.entity_id=p_entity_id AND b.accounting_status='POSTED' AND b.issue_date<=p_as_of
  ), movements AS (
    SELECT d.id,d.id AS document_id,d.party_id,d.source_type,d.issue_date AS effective_date,d.total AS delta,d.currency,d.accounting_event_id,d.journal_entry_id FROM documents d
    UNION ALL
    SELECT id,original_invoice_id,customer_id,'customer_credit_note',issue_date,-total,currency,accounting_event_id,journal_entry_id
    FROM public.customer_credit_notes WHERE p_kind='ar' AND org_id=v_org AND entity_id=p_entity_id AND issue_date<=p_as_of
    UNION ALL
    SELECT id,invoice_id,customer_id,'customer_receipt',receipt_date,-amount,currency,accounting_event_id,journal_entry_id
    FROM public.customer_receipts WHERE p_kind='ar' AND org_id=v_org AND entity_id=p_entity_id AND receipt_date<=p_as_of
    UNION ALL
    SELECT c.id,r.invoice_id,c.customer_id,'customer_receipt_correction',c.correction_date,c.amount,c.currency,c.accounting_event_id,c.journal_entry_id
    FROM public.customer_receipt_corrections c LEFT JOIN public.customer_receipts r ON r.id=c.original_receipt_id AND r.org_id=v_org AND r.entity_id=p_entity_id
    WHERE p_kind='ar' AND c.org_id=v_org AND c.entity_id=p_entity_id AND c.correction_date<=p_as_of
    UNION ALL
    SELECT id,invoice_id,customer_id,'customer_receipt_replacement',replacement_date,-amount,currency,accounting_event_id,journal_entry_id
    FROM public.customer_receipt_replacements WHERE p_kind='ar' AND org_id=v_org AND entity_id=p_entity_id AND replacement_date<=p_as_of
    UNION ALL
    SELECT id,original_bill_id,vendor_id,'supplier_bill_credit',issue_date,-total,currency,accounting_event_id,journal_entry_id
    FROM public.supplier_bill_credit_notes WHERE p_kind='ap' AND org_id=v_org AND entity_id=p_entity_id AND issue_date<=p_as_of
    UNION ALL
    SELECT id,bill_id,vendor_id,'supplier_payment',payment_date,-amount,currency,accounting_event_id,journal_entry_id
    FROM public.supplier_payments WHERE p_kind='ap' AND org_id=v_org AND entity_id=p_entity_id AND payment_date<=p_as_of
    UNION ALL
    SELECT c.id,r.bill_id,c.vendor_id,'supplier_payment_correction',c.correction_date,c.amount,c.currency,c.accounting_event_id,c.journal_entry_id
    FROM public.supplier_payment_corrections c LEFT JOIN public.supplier_payments r ON r.id=c.original_payment_id AND r.org_id=v_org AND r.entity_id=p_entity_id
    WHERE p_kind='ap' AND c.org_id=v_org AND c.entity_id=p_entity_id AND c.correction_date<=p_as_of
    UNION ALL
    SELECT id,bill_id,vendor_id,'supplier_payment_replacement',replacement_date,-amount,currency,accounting_event_id,journal_entry_id
    FROM public.supplier_payment_replacements WHERE p_kind='ap' AND org_id=v_org AND entity_id=p_entity_id AND replacement_date<=p_as_of
  ), verified AS (
    SELECT m.*,
      d.id IS NULL OR d.party_id IS DISTINCT FROM m.party_id OR m.currency IS DISTINCT FROM d.currency
      OR m.effective_date<d.issue_date OR m.delta IS NULL OR abs(m.delta)<=0 OR abs(m.delta)>d.total
      OR (m.source_type IN ('customer_invoice','supplier_bill','customer_credit_note','supplier_bill_credit') AND abs(m.delta) IS DISTINCT FROM d.total)
      OR ev.id IS NULL OR j.id IS NULL OR control_net.amount IS DISTINCT FROM m.delta AS invalid
    FROM movements m LEFT JOIN documents d ON d.id=m.document_id
    LEFT JOIN public.accounting_events ev ON ev.id=m.accounting_event_id AND ev.org_id=v_org AND ev.entity_id=p_entity_id
      AND ev.source_type=m.source_type AND ev.source_id=m.id AND ev.journal_entry_id=m.journal_entry_id
    LEFT JOIN public.journal_entries j ON j.id=m.journal_entry_id AND j.org_id=v_org AND j.entity_id=p_entity_id
      AND j.status='posted' AND j.accounting_event_id=m.accounting_event_id AND j.entry_date=m.effective_date
    LEFT JOIN LATERAL (SELECT sum(l.debit-l.credit)*CASE WHEN p_kind='ar' THEN 1 ELSE -1 END AS amount
      FROM public.journal_lines l WHERE l.journal_entry_id=m.journal_entry_id AND l.account_id=v_account) control_net ON true
  ), document_totals AS (
    SELECT document_id,sum(delta) AS outstanding FROM verified GROUP BY document_id
  ), balances AS (
    SELECT d.*,COALESCE(m.outstanding,0) AS outstanding
    FROM documents d LEFT JOIN document_totals m ON m.document_id=d.id
  ), aged AS (
    SELECT *,greatest(p_as_of-due_date,0) AS days_past_due,
      CASE WHEN due_date>=p_as_of THEN 'current' WHEN p_as_of-due_date<=30 THEN 'days1to30'
        WHEN p_as_of-due_date<=60 THEN 'days31to60' WHEN p_as_of-due_date<=90 THEN 'days61to90' ELSE 'days91plus' END AS bucket
    FROM balances
  ) SELECT
    (SELECT count(*) FROM documents),
    COALESCE((SELECT bool_or(invalid) FROM verified),false) OR COALESCE((SELECT bool_or(
      total IS NULL OR total<=0 OR total::text IN ('NaN','Infinity','-Infinity')
      OR outstanding<0 OR outstanding>total OR party_name IS NULL OR btrim(party_name)=''
      OR currency IS DISTINCT FROM v_trial->>'currency' OR account_control_id IS DISTINCT FROM v_control
      OR issue_date<DATE '0001-01-01' OR due_date<issue_date OR due_date>DATE '9999-12-31'
    ) FROM balances),false),
    COALESCE(jsonb_agg(jsonb_build_object('documentId',id,'documentNumber',number,'partyId',party_id,'partyName',party_name,
      'issueDate',to_char(issue_date,'YYYY-MM-DD'),'dueDate',to_char(due_date,'YYYY-MM-DD'),'daysPastDue',days_past_due,'bucket',bucket,
      'original',total::numeric(38,2)::text,'settled',(total-outstanding)::numeric(38,2)::text,'outstanding',outstanding::numeric(38,2)::text
    ) ORDER BY due_date,id) FILTER(WHERE outstanding>0),'[]'::jsonb)
  INTO v_count,v_invalid,v_rows FROM aged;
  IF v_invalid THEN RAISE EXCEPTION 'invalid or unverified subledger accounting history prevents aging'; END IF;
  v_open_count:=jsonb_array_length(v_rows);
  IF (v_open_count>0 AND p_offset>=v_open_count) OR (v_open_count=0 AND p_offset<>0) THEN RAISE EXCEPTION 'aging page is outside the selected history'; END IF;
  SELECT COALESCE(sum((value->>'outstanding')::numeric),0),jsonb_build_object(
    'current',COALESCE(sum((value->>'outstanding')::numeric) FILTER(WHERE value->>'bucket'='current'),0)::numeric(38,2)::text,
    'days1to30',COALESCE(sum((value->>'outstanding')::numeric) FILTER(WHERE value->>'bucket'='days1to30'),0)::numeric(38,2)::text,
    'days31to60',COALESCE(sum((value->>'outstanding')::numeric) FILTER(WHERE value->>'bucket'='days31to60'),0)::numeric(38,2)::text,
    'days61to90',COALESCE(sum((value->>'outstanding')::numeric) FILTER(WHERE value->>'bucket'='days61to90'),0)::numeric(38,2)::text,
    'days91plus',COALESCE(sum((value->>'outstanding')::numeric) FILTER(WHERE value->>'bucket'='days91plus'),0)::numeric(38,2)::text
  ) INTO v_outstanding,v_totals FROM jsonb_array_elements(v_rows);
  v_result:=jsonb_build_object('entityId',p_entity_id,'entityName',v_trial->>'entityName','currency',v_trial->>'currency',
    'kind',p_kind,'asOf',to_char(p_as_of,'YYYY-MM-DD'),'accountId',v_account,'accountCode',v_account_code,'accountName',v_account_name,
    'documentCount',v_count,'openCount',v_open_count,'excludedDraftCount',v_drafts,'buckets',v_totals,
    'outstanding',v_outstanding::numeric(38,2)::text,'ledgerBalance',v_ledger::numeric(38,2)::text,
    'variance',(v_ledger-v_outstanding)::numeric(38,2)::text,'reconciled',v_ledger=v_outstanding);
  v_revision:=md5(v_result::text || v_rows::text || (v_trial->>'revision'));
  IF p_expected_revision IS NOT NULL AND p_expected_revision IS DISTINCT FROM v_revision THEN
    RAISE EXCEPTION 'aging history changed; regenerate the report' USING ERRCODE='40001';
  END IF;
  RETURN v_result || jsonb_build_object('revision',v_revision,'generatedAt',statement_timestamp(),'offset',p_offset,'pageSize',p_page_size,
    'rows',(SELECT COALESCE(jsonb_agg(value ORDER BY position),'[]'::jsonb) FROM jsonb_array_elements(v_rows) WITH ORDINALITY AS r(value,position)
      WHERE position>p_offset AND position<=p_offset+p_page_size));
END;
$$;

-- Validate existing source graphs on upgrade; do not rewrite financial history.
DO $$ DECLARE r record; BEGIN
  FOR r IN SELECT id FROM public.customer_receipts LOOP PERFORM public.validate_customer_receipt_graph(r.id); END LOOP;
  FOR r IN SELECT id FROM public.supplier_payments LOOP PERFORM public.validate_supplier_payment_graph(r.id); END LOOP;
END $$;
COMMIT;
