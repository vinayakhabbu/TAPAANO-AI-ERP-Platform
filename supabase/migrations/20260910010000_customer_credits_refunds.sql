BEGIN;
LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF to_regprocedure('public.validate_statement_extension(uuid,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.validate_finance_extension(uuid,text,jsonb) RENAME TO validate_statement_extension;
  ALTER FUNCTION public.execute_finance_extension(public.finance_requests) RENAME TO execute_statement_extension;
  ALTER FUNCTION public.finance_source_snapshot(uuid,text,jsonb) RENAME TO statement_source_snapshot;
  ALTER FUNCTION public.validate_settlement_capacity(text,uuid) RENAME TO validate_pre_credit_settlement_capacity;
  ALTER FUNCTION public.contract_earned(uuid,date,jsonb) RENAME TO original_contract_earned;
 END IF;
END; $$;

CREATE TABLE IF NOT EXISTS public.finance_customer_credit_controls (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,
 liability_account_id uuid NOT NULL,request_id uuid NOT NULL,
 UNIQUE(org_id,id),UNIQUE(entity_id),UNIQUE(request_id),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,liability_account_id) REFERENCES public.accounts(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id)
);
CREATE TABLE IF NOT EXISTS public.finance_customer_credits (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,customer_id uuid NOT NULL,
 invoice_id uuid NOT NULL,control_id uuid NOT NULL,reference text NOT NULL,as_of date NOT NULL,
 amount numeric(15,2) NOT NULL CHECK(amount>0),ar_amount numeric(15,2) NOT NULL CHECK(ar_amount>=0),
 balance_amount numeric(15,2) NOT NULL CHECK(balance_amount>=0),lines jsonb NOT NULL,obligations jsonb NOT NULL,
 journal_lines jsonb NOT NULL,journal_id uuid NOT NULL,request_id uuid NOT NULL,
 reversal_date date,reversal_journal uuid,reversal_request uuid,
 UNIQUE(org_id,id),UNIQUE(org_id,reference),UNIQUE(request_id),CHECK(amount=ar_amount+balance_amount),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,customer_id) REFERENCES public.customers(org_id,id),
 FOREIGN KEY(org_id,invoice_id) REFERENCES public.invoices(org_id,id),
 FOREIGN KEY(org_id,control_id) REFERENCES public.finance_customer_credit_controls(org_id,id),
 FOREIGN KEY(org_id,journal_id) REFERENCES public.journal_entries(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,reversal_journal) REFERENCES public.journal_entries(org_id,id),
 FOREIGN KEY(org_id,reversal_request) REFERENCES public.finance_requests(org_id,id)
);
CREATE TABLE IF NOT EXISTS public.finance_customer_credit_uses (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,credit_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('REFUND','APPLY')),as_of date NOT NULL,amount numeric(15,2) NOT NULL CHECK(amount>0),
 invoice_id uuid,cash_account_id uuid,settlement_id uuid,settlement_kind text,reference text NOT NULL,
 journal_id uuid NOT NULL,request_id uuid NOT NULL,reversal_date date,reversal_journal uuid,reversal_request uuid,
 UNIQUE(org_id,id),UNIQUE(request_id),UNIQUE(org_id,entity_id,reference),
 CHECK((kind='REFUND' AND invoice_id IS NULL AND cash_account_id IS NOT NULL AND settlement_id IS NOT NULL AND settlement_kind IN ('RECEIPT','REPLACEMENT')) OR
  (kind='APPLY' AND invoice_id IS NOT NULL AND cash_account_id IS NULL AND settlement_id IS NULL AND settlement_kind IS NULL)),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,credit_id) REFERENCES public.finance_customer_credits(org_id,id),
 FOREIGN KEY(org_id,invoice_id) REFERENCES public.invoices(org_id,id),
 FOREIGN KEY(org_id,cash_account_id) REFERENCES public.accounts(org_id,id),
 FOREIGN KEY(org_id,journal_id) REFERENCES public.journal_entries(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,reversal_journal) REFERENCES public.journal_entries(org_id,id),
 FOREIGN KEY(org_id,reversal_request) REFERENCES public.finance_requests(org_id,id)
);
CREATE INDEX IF NOT EXISTS finance_customer_credits_invoice ON public.finance_customer_credits(invoice_id,as_of);
CREATE INDEX IF NOT EXISTS finance_customer_uses_credit ON public.finance_customer_credit_uses(credit_id,as_of);
CREATE INDEX IF NOT EXISTS finance_customer_uses_invoice ON public.finance_customer_credit_uses(invoice_id,as_of);

-- Dated AR movements are shared by capacity checks and the aging report.
CREATE OR REPLACE FUNCTION public.customer_adjustment_movements(p_invoice uuid)
RETURNS TABLE(id uuid,invoice_id uuid,as_of date,amount numeric,journal_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.id,c.invoice_id,c.as_of,c.ar_amount,c.journal_id FROM public.finance_customer_credits c WHERE c.invoice_id=p_invoice AND c.ar_amount>0
 UNION ALL SELECT c.id,c.invoice_id,c.reversal_date,-c.ar_amount,c.reversal_journal FROM public.finance_customer_credits c WHERE c.invoice_id=p_invoice AND c.ar_amount>0 AND c.reversal_date IS NOT NULL
 UNION ALL SELECT u.id,u.invoice_id,u.as_of,u.amount,u.journal_id FROM public.finance_customer_credit_uses u WHERE u.invoice_id=p_invoice
 UNION ALL SELECT u.id,u.invoice_id,u.reversal_date,-u.amount,u.reversal_journal FROM public.finance_customer_credit_uses u WHERE u.invoice_id=p_invoice AND u.reversal_date IS NOT NULL
$$;
CREATE OR REPLACE FUNCTION public.customer_invoice_movements(p_invoice uuid)
RETURNS TABLE(as_of date,amount numeric) LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT receipt_date,amount FROM public.customer_receipts WHERE invoice_id=p_invoice
 UNION ALL SELECT c.correction_date,-c.amount FROM public.customer_receipt_corrections c JOIN public.customer_receipts r ON r.id=c.original_receipt_id WHERE r.invoice_id=p_invoice
 UNION ALL SELECT replacement_date,amount FROM public.customer_receipt_replacements WHERE invoice_id=p_invoice
 UNION ALL SELECT issue_date,total FROM public.customer_credit_notes WHERE original_invoice_id=p_invoice
 UNION ALL SELECT as_of,amount FROM public.customer_adjustment_movements(p_invoice)
$$;
CREATE OR REPLACE FUNCTION public.customer_invoice_remaining(p_invoice uuid,p_date date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT i.total-coalesce((SELECT sum(m.amount) FROM public.customer_invoice_movements(i.id) m WHERE m.as_of<=p_date),0) FROM public.invoices i WHERE i.id=p_invoice
$$;
CREATE OR REPLACE FUNCTION public.validate_settlement_capacity(p_kind text,p_document_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_total numeric;
BEGIN
 PERFORM public.validate_pre_credit_settlement_capacity(p_kind,p_document_id);
 IF p_kind<>'ar' THEN RETURN; END IF;
 SELECT total INTO v_total FROM public.invoices WHERE id=p_document_id;
 IF EXISTS(WITH daily AS (SELECT as_of,sum(amount) AS amount FROM public.customer_invoice_movements(p_document_id) GROUP BY as_of), balances AS
  (SELECT sum(amount) OVER(ORDER BY as_of) AS settled FROM daily) SELECT 1 FROM balances WHERE settled<0 OR settled>v_total) THEN
  RAISE EXCEPTION 'receipts, credits and applications exceed the invoice balance at an effective date';
 END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.customer_credit_remaining(p_credit uuid,p_date date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT c.balance_amount-CASE WHEN c.reversal_date<=p_date THEN c.balance_amount ELSE 0 END-
  coalesce((SELECT sum(u.amount-CASE WHEN u.reversal_date<=p_date THEN u.amount ELSE 0 END) FROM public.finance_customer_credit_uses u WHERE u.credit_id=c.id AND u.as_of<=p_date),0)
 FROM public.finance_customer_credits c WHERE c.id=p_credit AND c.as_of<=p_date
$$;

-- Price concessions retain original billed consideration and recognition entries.
-- The recognition target adds back the separately posted revenue reduction, so
-- the existing cumulative posting engine only posts the remaining net service.
CREATE OR REPLACE FUNCTION public.contract_earned(p_cycle_id uuid,p_as_of date,p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb:='[]';v_o jsonb;v_price numeric;v_reduction numeric;v_recognized numeric;
BEGIN
 FOR v_o IN SELECT value FROM jsonb_array_elements(public.original_contract_earned(p_cycle_id,p_as_of,p_evidence)) LOOP
  SELECT (a->>'amount')::numeric INTO v_price FROM public.finance_contract_cycles s CROSS JOIN LATERAL jsonb_array_elements(s.allocations) a WHERE s.id=p_cycle_id AND a->>'key'=v_o->>'key';
  SELECT coalesce(sum((a->>'amount')::numeric),0),coalesce(sum((a->>'recognized')::numeric),0) INTO v_reduction,v_recognized
   FROM public.finance_customer_credits c JOIN public.finance_contract_cycles s ON s.invoice_id=c.invoice_id CROSS JOIN LATERAL jsonb_array_elements(c.obligations) a
   WHERE s.id=p_cycle_id AND a->>'key'=v_o->>'key' AND c.as_of<=p_as_of AND (c.reversal_date IS NULL OR c.reversal_date>p_as_of);
  v_result:=v_result||jsonb_build_array(jsonb_build_object('key',v_o->>'key','amount',round((v_o->>'amount')::numeric-CASE WHEN v_price=0 THEN 0 ELSE round((v_o->>'amount')::numeric*v_reduction/v_price,2) END+v_recognized,2)::text));
 END LOOP;
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.customer_credit_preview(p_entity uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_i public.invoices%ROWTYPE;v_policy public.finance_customer_credit_controls%ROWTYPE;
 v_cycle public.finance_contract_cycles%ROWTYPE;v_contract public.finance_contracts%ROWTYPE;v_line record;v_o jsonb;v_item jsonb;
 v_total numeric:=0;v_amount numeric;v_remaining numeric;v_ar numeric;v_balance numeric;v_allocated numeric:=0;v_cumulative numeric:=0;
 v_price numeric;v_rec numeric;v_prior numeric;v_rec_part numeric;v_revenue_part numeric:=0;v_deferred_part numeric:=0;
 v_date date:=(p_payload->>'date')::date;v_lines jsonb:='[]';v_obligations jsonb:='[]';v_journal jsonb:='[]';v_seen uuid[]:='{}';v_ar_account uuid;
BEGIN
 SELECT * INTO v_i FROM public.invoices WHERE id=(p_payload->>'invoice_id')::uuid AND entity_id=p_entity AND org_id=v_org AND accounting_status='POSTED';
 IF v_i.id IS NULL THEN RAISE EXCEPTION 'posted customer invoice unavailable'; END IF;
 PERFORM public.validate_customer_invoice_graph(v_i.id);PERFORM public.validate_settlement_capacity('ar',v_i.id);
 SELECT * INTO v_policy FROM public.finance_customer_credit_controls WHERE entity_id=p_entity AND org_id=v_org;
 IF v_policy.id IS NULL THEN RAISE EXCEPTION 'approve a customer credit liability account first'; END IF;
 IF v_date<v_i.issue_date OR v_date>CURRENT_DATE OR EXISTS(SELECT 1 FROM public.customer_invoice_movements(v_i.id) WHERE as_of>v_date) OR
  EXISTS(SELECT 1 FROM public.finance_customer_credits WHERE invoice_id=v_i.id AND (as_of>v_date OR reversal_date>v_date)) THEN RAISE EXCEPTION 'credit date must follow invoice and settlement history and cannot be in the future'; END IF;
 IF EXISTS(SELECT 1 FROM public.customer_credit_notes WHERE original_invoice_id=v_i.id) THEN RAISE EXCEPTION 'invoice already has a legacy full credit'; END IF;
 IF jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'credit one to 200 original invoice lines'; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
  IF v_item-ARRAY['line_id','amount']<>'{}'::jsonb OR jsonb_typeof(v_item->'amount') IS DISTINCT FROM 'string' OR (v_item->>'line_id')::uuid=ANY(v_seen) THEN RAISE EXCEPTION 'credit lines must be unique with exact decimal amounts'; END IF;
  SELECT * INTO v_line FROM public.invoice_lines WHERE id=(v_item->>'line_id')::uuid AND invoice_id=v_i.id AND org_id=v_org;
  IF v_line.id IS NULL THEN RAISE EXCEPTION 'original invoice line unavailable'; END IF;
  v_amount:=public.cash_amount(v_item->>'amount');
  SELECT v_line.line_total-coalesce(sum((a->>'amount')::numeric),0) INTO v_remaining FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.lines) a
   WHERE c.invoice_id=v_i.id AND c.reversal_date IS NULL AND a->>'lineId'=v_line.id::text;
  IF v_amount<=0 OR v_amount>v_remaining THEN RAISE EXCEPTION 'credit exceeds the uncredited original invoice line'; END IF;
  v_total:=v_total+v_amount;v_seen:=array_append(v_seen,v_line.id);
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object('lineId',v_line.id,'description',v_line.description,'amount',round(v_amount,2)::text,'revenueAccountId',v_line.revenue_account_id));
 END LOOP;
 SELECT ar_account_id INTO v_ar_account FROM public.entity_invoice_account_controls WHERE id=v_i.account_control_id;
 v_ar:=least(v_total,public.customer_invoice_remaining(v_i.id,v_date));v_balance:=v_total-v_ar;
 SELECT * INTO v_cycle FROM public.finance_contract_cycles WHERE invoice_id=v_i.id;
 IF v_cycle.id IS NOT NULL THEN
  SELECT * INTO v_contract FROM public.finance_contracts WHERE id=v_cycle.contract_id;
  IF EXISTS(SELECT 1 FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id AND as_of>v_date) THEN RAISE EXCEPTION 'credit must follow recognized contract history'; END IF;
  SELECT v_cycle.price-coalesce(sum(amount),0) INTO v_remaining FROM public.finance_customer_credits WHERE invoice_id=v_i.id AND reversal_date IS NULL;
  FOR v_o IN SELECT value FROM jsonb_array_elements(v_cycle.allocations) LOOP
   SELECT coalesce(sum((a->>'amount')::numeric),0),coalesce(sum((a->>'recognized')::numeric),0) INTO v_prior,v_rec_part
    FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.obligations) a WHERE c.invoice_id=v_i.id AND c.reversal_date IS NULL AND a->>'key'=v_o->>'key';
   v_price:=(v_o->>'amount')::numeric-v_prior;
   SELECT coalesce(sum((a->>'amount')::numeric),0)-v_rec_part INTO v_rec FROM public.finance_revenue_entries e CROSS JOIN LATERAL jsonb_array_elements(e.allocations) a WHERE e.cycle_id=v_cycle.id AND a->>'key'=v_o->>'key';
   v_cumulative:=v_cumulative+v_price;v_amount:=round(v_total*v_cumulative/v_remaining,2)-v_allocated;v_allocated:=v_allocated+v_amount;
   v_rec_part:=CASE WHEN v_price=0 THEN 0 ELSE round(v_amount*v_rec/v_price,2) END;
   v_revenue_part:=v_revenue_part+v_rec_part;v_deferred_part:=v_deferred_part+v_amount-v_rec_part;
   v_obligations:=v_obligations||jsonb_build_array(jsonb_build_object('key',v_o->>'key','amount',round(v_amount,2)::text,'recognized',round(v_rec_part,2)::text));
  END LOOP;
  IF v_revenue_part>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_lines->0->>'revenueAccountId','debit',round(v_revenue_part,2)::text,'credit','0.00')); END IF;
  IF v_deferred_part>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_contract.terms->>'deferred_account_id','debit',round(v_deferred_part,2)::text,'credit','0.00')); END IF;
 ELSE
  SELECT jsonb_agg(jsonb_build_object('account_id',account,'debit',round(amount,2)::text,'credit','0.00') ORDER BY account) INTO v_journal
   FROM (SELECT a->>'revenueAccountId' AS account,sum((a->>'amount')::numeric) AS amount FROM jsonb_array_elements(v_lines) a GROUP BY 1) x;
 END IF;
 IF v_ar>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_ar_account,'debit','0.00','credit',round(v_ar,2)::text)); END IF;
 IF v_balance>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_policy.liability_account_id,'debit','0.00','credit',round(v_balance,2)::text)); END IF;
 RETURN jsonb_build_object('invoiceId',v_i.id,'customerId',v_i.customer_id,'controlId',v_policy.id,'amount',round(v_total,2)::text,'arAmount',round(v_ar,2)::text,'balanceAmount',round(v_balance,2)::text,'lines',v_lines,'obligations',v_obligations,'journalLines',v_journal);
END; $$;
CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_c public.finance_customer_credits%ROWTYPE;v_u public.finance_customer_credit_uses%ROWTYPE;v_i public.invoices%ROWTYPE;
 v_date date;v_amount numeric;v_receipt record;v_control uuid;
BEGIN
 IF p_kind='CONTRACT_RECOGNIZE' AND EXISTS(SELECT 1 FROM public.finance_customer_credits cr JOIN public.finance_contract_cycles s ON s.invoice_id=cr.invoice_id WHERE s.id=(p_payload->>'cycle_id')::uuid AND greatest(cr.as_of,coalesce(cr.reversal_date,cr.as_of))>=(p_payload->>'as_of')::date) THEN RAISE EXCEPTION 'recognition must follow approved customer credit history; recognize catch-up service at a subsequent cutoff'; END IF;
 IF p_kind NOT IN ('CUSTOMER_CREDIT_POLICY','CUSTOMER_CREDIT','CUSTOMER_CREDIT_REVERSE','CUSTOMER_REFUND','CUSTOMER_CREDIT_APPLY','CUSTOMER_CREDIT_USE_REVERSE') THEN RETURN public.validate_statement_extension(p_entity,p_kind,p_payload); END IF;
 IF p_kind='CUSTOMER_CREDIT_POLICY' THEN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'customer credit policy requires two administrators'; END IF;
  IF p_payload-ARRAY['liability_account_id']<>'{}'::jsonb OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(p_payload->>'liability_account_id')::uuid AND org_id=v_org AND is_active AND account_type='liability') THEN RAISE EXCEPTION 'active customer credit liability account required'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_customer_credit_controls WHERE entity_id=p_entity) THEN RAISE EXCEPTION 'customer credit policy is already configured'; END IF;
  v_control:=(p_payload->>'liability_account_id')::uuid;
  IF EXISTS(SELECT 1 FROM public.entity_supplier_bill_account_controls WHERE entity_id=p_entity AND ap_account_id=v_control) OR EXISTS(SELECT 1 FROM public.finance_contracts WHERE entity_id=p_entity AND terms->>'deferred_account_id'=v_control::text) OR EXISTS(SELECT 1 FROM public.finance_intercompany WHERE (entity_id=p_entity OR counterparty_id=p_entity) AND terms->>'due_to_account_id'=v_control::text) OR
   EXISTS(SELECT 1 FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.entity_id=p_entity AND l.account_id=v_control) THEN RAISE EXCEPTION 'customer credit liability requires a dedicated unused control account'; END IF;
  RETURN p_payload;
 END IF;
 IF coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'customer adjustment accounting date required'; END IF;
 v_date:=(p_payload->>'date')::date;
 IF v_date<DATE '0001-01-01' OR v_date>CURRENT_DATE THEN RAISE EXCEPTION 'customer adjustment date cannot be in the future'; END IF;
 IF p_kind='CUSTOMER_CREDIT' THEN
  IF p_payload-ARRAY['invoice_id','reference','date','lines']<>'{}'::jsonb OR length(coalesce(p_payload->>'reference','')) NOT BETWEEN 1 AND 80 OR p_payload->>'reference'<>btrim(p_payload->>'reference') OR p_payload->>'reference' ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'invalid customer credit fields'; END IF;
  PERFORM public.customer_credit_preview(p_entity,p_payload);RETURN p_payload;
 END IF;
 IF p_kind='CUSTOMER_CREDIT_USE_REVERSE' THEN
  IF p_payload-ARRAY['use_id','date']<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid customer credit use correction fields'; END IF;
  SELECT * INTO v_u FROM public.finance_customer_credit_uses WHERE id=(p_payload->>'use_id')::uuid AND org_id=v_org AND entity_id=p_entity;
  IF v_u.id IS NULL OR v_u.reversal_date IS NOT NULL OR v_date<v_u.as_of THEN RAISE EXCEPTION 'active customer credit use and subsequent correction date required'; END IF;
  SELECT * INTO v_c FROM public.finance_customer_credits WHERE id=v_u.credit_id;
 ELSE
  SELECT * INTO v_c FROM public.finance_customer_credits WHERE id=(p_payload->>'credit_id')::uuid AND org_id=v_org AND entity_id=p_entity;
 END IF;
 IF v_c.id IS NULL OR v_c.reversal_date IS NOT NULL OR v_date<v_c.as_of THEN RAISE EXCEPTION 'active customer credit and subsequent accounting date required'; END IF;
 IF EXISTS(SELECT 1 FROM public.finance_customer_credit_uses WHERE credit_id=v_c.id AND (as_of>v_date OR reversal_date>v_date)) THEN RAISE EXCEPTION 'customer credit activity must advance in date order'; END IF;
 IF p_kind='CUSTOMER_CREDIT_USE_REVERSE' THEN RETURN p_payload; END IF;
 IF p_kind='CUSTOMER_CREDIT_REVERSE' THEN
  IF p_payload-ARRAY['credit_id','date']<>'{}'::jsonb OR EXISTS(SELECT 1 FROM public.finance_customer_credit_uses WHERE credit_id=v_c.id AND reversal_date IS NULL) THEN RAISE EXCEPTION 'correct all active refunds and applications before reversing a credit'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_customer_credits c JOIN public.finance_requests r ON r.id=c.request_id WHERE c.invoice_id=v_c.invoice_id AND c.id<>v_c.id AND ((c.reversal_date IS NULL AND r.source_snapshot->'credits' @> jsonb_build_array(jsonb_build_object('id',v_c.id))) OR c.reversal_date>v_date)) THEN RAISE EXCEPTION 'reverse the latest invoice credit first'; END IF;
  RETURN p_payload;
 END IF;
 IF jsonb_typeof(p_payload->'amount') IS DISTINCT FROM 'string' OR length(coalesce(p_payload->>'reference','')) NOT BETWEEN 1 AND 160 OR p_payload->>'reference'<>btrim(p_payload->>'reference') OR p_payload->>'reference' ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'exact customer credit use amount and confirmation reference required'; END IF;
 v_amount:=public.cash_amount(p_payload->>'amount');
 IF v_amount<=0 OR v_amount>public.customer_credit_remaining(v_c.id,v_date) THEN RAISE EXCEPTION 'refund or application exceeds the available customer credit balance'; END IF;
 IF p_kind='CUSTOMER_CREDIT_APPLY' THEN
  IF p_payload-ARRAY['credit_id','date','amount','reference','invoice_id']<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid customer credit application fields'; END IF;
  SELECT * INTO v_i FROM public.invoices WHERE id=(p_payload->>'invoice_id')::uuid AND org_id=v_org AND entity_id=p_entity AND customer_id=v_c.customer_id AND accounting_status='POSTED';
  IF v_i.id IS NULL OR v_date<v_i.issue_date OR v_amount>public.customer_invoice_remaining(v_i.id,v_date) THEN RAISE EXCEPTION 'application requires an outstanding invoice for the same customer and entity'; END IF;
  PERFORM public.validate_customer_invoice_graph(v_i.id);
 ELSE
  IF p_payload-ARRAY['credit_id','date','amount','reference','cash_account_id','settlement_id','settlement_kind']<>'{}'::jsonb OR coalesce(p_payload->>'settlement_kind','') NOT IN ('RECEIPT','REPLACEMENT') THEN RAISE EXCEPTION 'refund requires its original receipt or replacement and confirmed bank reference'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.cash_registers c JOIN public.accounts a ON a.id=c.account_id WHERE c.entity_id=p_entity AND c.org_id=v_org AND c.account_id=(p_payload->>'cash_account_id')::uuid AND a.is_active AND a.account_type='asset') THEN RAISE EXCEPTION 'registered active refund cash account required'; END IF;
  SELECT id,invoice_id,receipt_date AS as_of,amount INTO v_receipt FROM public.customer_receipts WHERE p_payload->>'settlement_kind'='RECEIPT' AND id=(p_payload->>'settlement_id')::uuid AND org_id=v_org
   UNION ALL SELECT id,invoice_id,replacement_date,amount FROM public.customer_receipt_replacements WHERE p_payload->>'settlement_kind'='REPLACEMENT' AND id=(p_payload->>'settlement_id')::uuid AND org_id=v_org;
  IF v_receipt.id IS NULL OR v_receipt.invoice_id<>v_c.invoice_id OR v_receipt.as_of>v_date OR (p_payload->>'settlement_kind'='RECEIPT' AND EXISTS(SELECT 1 FROM public.customer_receipt_corrections WHERE original_receipt_id=v_receipt.id)) THEN RAISE EXCEPTION 'refund receipt must be active and belong to the credited invoice'; END IF;
  IF v_amount+coalesce((SELECT sum(amount) FROM public.finance_customer_credit_uses WHERE kind='REFUND' AND settlement_id=v_receipt.id AND reversal_date IS NULL),0)>v_receipt.amount THEN RAISE EXCEPTION 'total refunds exceed the original receipt'; END IF;
 END IF;
 RETURN p_payload;
END; $$;

CREATE OR REPLACE FUNCTION public.finance_source_snapshot(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_invoice uuid;v_credit uuid;v_result jsonb;v_org uuid:=public.get_user_org_id();
BEGIN
 IF p_kind NOT IN ('CUSTOMER_CREDIT_POLICY','CUSTOMER_CREDIT','CUSTOMER_CREDIT_REVERSE','CUSTOMER_REFUND','CUSTOMER_CREDIT_APPLY','CUSTOMER_CREDIT_USE_REVERSE') THEN RETURN public.statement_source_snapshot(p_entity,p_kind,p_payload); END IF;
 IF p_kind='CUSTOMER_CREDIT_POLICY' THEN RETURN jsonb_build_object('existingPolicy',(SELECT to_jsonb(c) FROM public.finance_customer_credit_controls c WHERE entity_id=p_entity AND org_id=v_org)); END IF;
 v_credit:=(p_payload->>'credit_id')::uuid;
 IF p_kind='CUSTOMER_CREDIT_USE_REVERSE' THEN SELECT credit_id INTO v_credit FROM public.finance_customer_credit_uses WHERE id=(p_payload->>'use_id')::uuid AND entity_id=p_entity AND org_id=v_org; END IF;
 IF p_kind='CUSTOMER_CREDIT' THEN v_invoice:=(p_payload->>'invoice_id')::uuid;
 ELSE SELECT invoice_id INTO v_invoice FROM public.finance_customer_credits WHERE id=v_credit AND entity_id=p_entity AND org_id=v_org; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=v_invoice AND entity_id=p_entity AND org_id=v_org) THEN RAISE EXCEPTION 'customer adjustment source unavailable'; END IF;
 SELECT jsonb_build_object('invoice',i.invoice_number,'originalTotal',i.total::text,'remaining',public.customer_invoice_remaining(i.id,(p_payload->>'date')::date)::numeric(38,2)::text,
  'movements',coalesce((SELECT jsonb_agg(jsonb_build_array(as_of,amount::text) ORDER BY as_of,amount) FROM public.customer_invoice_movements(i.id)),'[]'),
  'credits',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.id) FROM public.finance_customer_credits c WHERE c.invoice_id=i.id),'[]'),
  'uses',coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM public.finance_customer_credit_uses u JOIN public.finance_customer_credits c ON c.id=u.credit_id WHERE c.invoice_id=i.id),'[]'),
  'recognitions',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.finance_revenue_entries e JOIN public.finance_contract_cycles s ON s.id=e.cycle_id WHERE s.invoice_id=i.id),'[]'),
  'targetInvoice',CASE WHEN p_kind='CUSTOMER_CREDIT_APPLY' THEN jsonb_build_object('id',p_payload->>'invoice_id','remaining',public.customer_invoice_remaining((p_payload->>'invoice_id')::uuid,(p_payload->>'date')::date)::numeric(38,2)::text) END)
 INTO v_result FROM public.invoices i WHERE i.id=v_invoice;
 IF p_kind='CUSTOMER_CREDIT' THEN v_result:=v_result||jsonb_build_object('creditPreview',public.customer_credit_preview(p_entity,p_payload)); END IF;
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p jsonb:=p_request.payload;v_preview jsonb;v_id uuid;v_journal uuid;v_date date;v_c public.finance_customer_credits%ROWTYPE;v_u public.finance_customer_credit_uses%ROWTYPE;v_liability uuid;v_offset uuid;v_lines jsonb;
BEGIN
 IF p_request.kind NOT IN ('CUSTOMER_CREDIT_POLICY','CUSTOMER_CREDIT','CUSTOMER_CREDIT_REVERSE','CUSTOMER_REFUND','CUSTOMER_CREDIT_APPLY','CUSTOMER_CREDIT_USE_REVERSE') THEN RETURN public.execute_statement_extension(p_request); END IF;
 IF p_request.kind='CUSTOMER_CREDIT_POLICY' THEN
  INSERT INTO public.finance_customer_credit_controls(org_id,entity_id,liability_account_id,request_id) VALUES(p_request.org_id,p_request.entity_id,(v_p->>'liability_account_id')::uuid,p_request.id) RETURNING id INTO v_id;
  RETURN jsonb_build_object('policyId',v_id);
 END IF;
 v_date:=(v_p->>'date')::date;
 IF p_request.kind='CUSTOMER_CREDIT' THEN
  v_preview:=public.customer_credit_preview(p_request.entity_id,v_p);
  v_journal:=public.post_manual_journal(p_request.entity_id,'CUSTOMER-CREDIT-'||p_request.id,v_date,'Customer credit: '||(v_p->>'reference'),v_preview->'journalLines','finance:'||p_request.id||':credit');
  INSERT INTO public.finance_customer_credits(org_id,entity_id,customer_id,invoice_id,control_id,reference,as_of,amount,ar_amount,balance_amount,lines,obligations,journal_lines,journal_id,request_id)
   VALUES(p_request.org_id,p_request.entity_id,(v_preview->>'customerId')::uuid,(v_p->>'invoice_id')::uuid,(v_preview->>'controlId')::uuid,v_p->>'reference',v_date,(v_preview->>'amount')::numeric,(v_preview->>'arAmount')::numeric,(v_preview->>'balanceAmount')::numeric,v_preview->'lines',v_preview->'obligations',v_preview->'journalLines',v_journal,p_request.id) RETURNING id INTO v_id;
  RETURN jsonb_build_object('creditId',v_id,'journalId',v_journal,'amount',v_preview->>'amount','arAmount',v_preview->>'arAmount','balanceAmount',v_preview->>'balanceAmount');
 END IF;
 IF p_request.kind='CUSTOMER_CREDIT_USE_REVERSE' THEN
  SELECT * INTO v_u FROM public.finance_customer_credit_uses WHERE id=(v_p->>'use_id')::uuid;
  v_journal:=public.reverse_posted_journal(v_u.journal_id,v_date,p_request.reason,'finance:'||p_request.id||':use-reversal');
  UPDATE public.finance_customer_credit_uses SET reversal_date=v_date,reversal_journal=v_journal,reversal_request=p_request.id WHERE id=v_u.id;
  RETURN jsonb_build_object('useId',v_u.id,'journalId',v_journal);
 END IF;
 SELECT * INTO v_c FROM public.finance_customer_credits WHERE id=(v_p->>'credit_id')::uuid;
 IF p_request.kind='CUSTOMER_CREDIT_REVERSE' THEN
  v_journal:=public.reverse_posted_journal(v_c.journal_id,v_date,p_request.reason,'finance:'||p_request.id||':credit-reversal');
  UPDATE public.finance_customer_credits SET reversal_date=v_date,reversal_journal=v_journal,reversal_request=p_request.id WHERE id=v_c.id;
  RETURN jsonb_build_object('creditId',v_c.id,'journalId',v_journal);
 END IF;
 SELECT liability_account_id INTO v_liability FROM public.finance_customer_credit_controls WHERE id=v_c.control_id;
 IF p_request.kind='CUSTOMER_REFUND' THEN v_offset:=(v_p->>'cash_account_id')::uuid;
 ELSE SELECT ar_account_id INTO v_offset FROM public.entity_invoice_account_controls WHERE entity_id=p_request.entity_id; END IF;
 v_lines:=public.finance_pair_lines(v_liability,v_offset,public.cash_amount(v_p->>'amount'));
 v_journal:=public.post_manual_journal(p_request.entity_id,'CUSTOMER-USE-'||p_request.id,v_date,'Customer credit use: '||(v_p->>'reference'),v_lines,'finance:'||p_request.id||':use');
 INSERT INTO public.finance_customer_credit_uses(org_id,entity_id,credit_id,kind,as_of,amount,invoice_id,cash_account_id,settlement_id,settlement_kind,reference,journal_id,request_id)
  VALUES(p_request.org_id,p_request.entity_id,v_c.id,CASE WHEN p_request.kind='CUSTOMER_REFUND' THEN 'REFUND' ELSE 'APPLY' END,v_date,public.cash_amount(v_p->>'amount'),(v_p->>'invoice_id')::uuid,(v_p->>'cash_account_id')::uuid,(v_p->>'settlement_id')::uuid,v_p->>'settlement_kind',v_p->>'reference',v_journal,p_request.id) RETURNING id INTO v_id;
 RETURN jsonb_build_object('useId',v_id,'journalId',v_journal,'amount',round(public.cash_amount(v_p->>'amount'),2)::text);
END; $$;


CREATE OR REPLACE FUNCTION public.validate_customer_credit_control_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_c public.finance_customer_credit_controls%ROWTYPE;
BEGIN
 SELECT * INTO v_c FROM public.finance_customer_credit_controls WHERE id=p_id;
 IF v_c.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=v_c.liability_account_id AND org_id=v_c.org_id AND account_type='liability') OR
  NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_c.request_id AND org_id=v_c.org_id AND entity_id=v_c.entity_id AND kind='CUSTOMER_CREDIT_POLICY' AND payload->>'liability_account_id'=v_c.liability_account_id::text AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by) THEN RAISE EXCEPTION 'customer credit policy approval graph is invalid'; END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.validate_customer_credit_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_c public.finance_customer_credits%ROWTYPE;v_r public.finance_requests%ROWTYPE;v_i public.invoices%ROWTYPE;v_p jsonb;v_line jsonb;v_day record;v_total numeric;
BEGIN
 SELECT * INTO v_c FROM public.finance_customer_credits WHERE id=p_id;
 IF v_c.id IS NULL THEN RAISE EXCEPTION 'customer credit graph is missing'; END IF;
 SELECT * INTO v_i FROM public.invoices WHERE id=v_c.invoice_id;
 SELECT * INTO v_r FROM public.finance_requests WHERE id=v_c.request_id;
 v_p:=v_r.source_snapshot->'creditPreview';
 IF v_r.id IS NULL OR v_r.org_id<>v_c.org_id OR v_r.entity_id<>v_c.entity_id OR v_r.kind<>'CUSTOMER_CREDIT' OR v_r.state NOT IN ('APPROVED','EXECUTING') OR v_r.requested_by=v_r.decided_by OR
  v_r.payload->>'reference' IS DISTINCT FROM v_c.reference OR (v_r.payload->>'date')::date IS DISTINCT FROM v_c.as_of OR
  v_p IS DISTINCT FROM jsonb_build_object('invoiceId',v_c.invoice_id,'customerId',v_c.customer_id,'controlId',v_c.control_id,'amount',v_c.amount::text,'arAmount',v_c.ar_amount::text,'balanceAmount',v_c.balance_amount::text,'lines',v_c.lines,'obligations',v_c.obligations,'journalLines',v_c.journal_lines) OR
  v_i.org_id IS DISTINCT FROM v_c.org_id OR v_i.entity_id IS DISTINCT FROM v_c.entity_id OR v_i.customer_id IS DISTINCT FROM v_c.customer_id OR v_i.issue_date>v_c.as_of THEN RAISE EXCEPTION 'customer credit approval or invoice graph is invalid'; END IF;
 PERFORM public.validate_customer_invoice_graph(v_c.invoice_id);PERFORM public.validate_customer_credit_control_graph(v_c.control_id);
 IF (SELECT sum((a->>'amount')::numeric) FROM jsonb_array_elements(v_c.lines) a) IS DISTINCT FROM v_c.amount THEN RAISE EXCEPTION 'customer credit line total is invalid'; END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(v_c.lines) LOOP
  SELECT line_total INTO v_total FROM public.invoice_lines WHERE id=(v_line->>'lineId')::uuid AND invoice_id=v_c.invoice_id;
  IF v_total IS NULL OR (v_line->>'amount')::numeric<=0 THEN RAISE EXCEPTION 'customer credit original line is invalid'; END IF;
  IF EXISTS(WITH movements AS (
   SELECT c.as_of AS day,(a->>'amount')::numeric AS amount FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.lines) a WHERE c.invoice_id=v_c.invoice_id AND a->>'lineId'=v_line->>'lineId'
   UNION ALL SELECT c.reversal_date,-(a->>'amount')::numeric FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.lines) a WHERE c.invoice_id=v_c.invoice_id AND a->>'lineId'=v_line->>'lineId' AND c.reversal_date IS NOT NULL
  ),daily AS(SELECT day,sum(amount) AS amount FROM movements GROUP BY day),balances AS(SELECT sum(amount) OVER(ORDER BY day) AS amount FROM daily) SELECT 1 FROM balances WHERE amount<0 OR amount>v_total) THEN RAISE EXCEPTION 'dated credits exceed the original invoice line'; END IF;
 END LOOP;
 PERFORM public.assert_finance_journal(v_c.journal_id,v_c.org_id,v_c.entity_id,v_c.as_of,v_c.journal_lines,v_c.reversal_journal);
 IF v_c.reversal_date IS NOT NULL THEN
  IF v_c.reversal_date<v_c.as_of OR NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_c.reversal_request AND org_id=v_c.org_id AND entity_id=v_c.entity_id AND kind='CUSTOMER_CREDIT_REVERSE' AND payload->>'credit_id'=v_c.id::text AND (payload->>'date')::date=v_c.reversal_date AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by) THEN RAISE EXCEPTION 'customer credit reversal approval is invalid'; END IF;
  PERFORM public.assert_finance_journal(v_c.reversal_journal,v_c.org_id,v_c.entity_id,v_c.reversal_date,public.flip_finance_lines(v_c.journal_lines),NULL,v_c.journal_id);
 ELSIF v_c.reversal_journal IS NOT NULL OR v_c.reversal_request IS NOT NULL THEN RAISE EXCEPTION 'incomplete customer credit reversal'; END IF;
 FOR v_day IN SELECT v_c.as_of AS day UNION SELECT v_c.reversal_date WHERE v_c.reversal_date IS NOT NULL UNION SELECT as_of FROM public.finance_customer_credit_uses WHERE credit_id=v_c.id UNION SELECT reversal_date FROM public.finance_customer_credit_uses WHERE credit_id=v_c.id AND reversal_date IS NOT NULL LOOP
  v_total:=public.customer_credit_remaining(v_c.id,v_day.day);
  IF v_total<0 OR v_total>v_c.balance_amount THEN RAISE EXCEPTION 'dated refund and application balance exceeds the customer credit'; END IF;
 END LOOP;
 PERFORM public.validate_settlement_capacity('ar',v_c.invoice_id);
END; $$;
CREATE OR REPLACE FUNCTION public.validate_customer_credit_use_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_u public.finance_customer_credit_uses%ROWTYPE;v_c public.finance_customer_credits%ROWTYPE;v_r public.finance_requests%ROWTYPE;v_liability uuid;v_offset uuid;v_lines jsonb;v_receipt record;
BEGIN
 SELECT * INTO v_u FROM public.finance_customer_credit_uses WHERE id=p_id;
 SELECT * INTO v_c FROM public.finance_customer_credits WHERE id=v_u.credit_id;
 SELECT * INTO v_r FROM public.finance_requests WHERE id=v_u.request_id;
 IF v_u.id IS NULL OR v_c.org_id IS DISTINCT FROM v_u.org_id OR v_c.entity_id IS DISTINCT FROM v_u.entity_id OR v_u.as_of<v_c.as_of OR
  v_r.id IS NULL OR v_r.org_id<>v_u.org_id OR v_r.entity_id<>v_u.entity_id OR v_r.kind<>(CASE WHEN v_u.kind='REFUND' THEN 'CUSTOMER_REFUND' ELSE 'CUSTOMER_CREDIT_APPLY' END) OR v_r.state NOT IN ('APPROVED','EXECUTING') OR v_r.requested_by=v_r.decided_by OR
  (v_r.payload->>'credit_id')::uuid IS DISTINCT FROM v_u.credit_id OR (v_r.payload->>'date')::date IS DISTINCT FROM v_u.as_of OR (v_r.payload->>'amount')::numeric IS DISTINCT FROM v_u.amount OR v_r.payload->>'reference' IS DISTINCT FROM v_u.reference OR
  (v_r.payload->>'invoice_id')::uuid IS DISTINCT FROM v_u.invoice_id OR (v_r.payload->>'cash_account_id')::uuid IS DISTINCT FROM v_u.cash_account_id OR (v_r.payload->>'settlement_id')::uuid IS DISTINCT FROM v_u.settlement_id OR v_r.payload->>'settlement_kind' IS DISTINCT FROM v_u.settlement_kind THEN RAISE EXCEPTION 'customer credit use approval graph is invalid'; END IF;
 PERFORM public.validate_customer_credit_graph(v_c.id);
 SELECT liability_account_id INTO v_liability FROM public.finance_customer_credit_controls WHERE id=v_c.control_id;
 IF v_u.kind='REFUND' THEN
  v_offset:=v_u.cash_account_id;
  IF NOT EXISTS(SELECT 1 FROM public.cash_registers WHERE org_id=v_u.org_id AND entity_id=v_u.entity_id AND account_id=v_offset) THEN RAISE EXCEPTION 'refund cash source is invalid'; END IF;
  SELECT id,invoice_id,receipt_date AS as_of,amount INTO v_receipt FROM public.customer_receipts WHERE v_u.settlement_kind='RECEIPT' AND id=v_u.settlement_id
   UNION ALL SELECT id,invoice_id,replacement_date,amount FROM public.customer_receipt_replacements WHERE v_u.settlement_kind='REPLACEMENT' AND id=v_u.settlement_id;
  IF v_receipt.id IS NULL OR v_receipt.invoice_id<>v_c.invoice_id OR v_receipt.as_of>v_u.as_of THEN RAISE EXCEPTION 'refund original receipt graph is invalid'; END IF;
  IF EXISTS(WITH movements AS(SELECT as_of AS day,amount FROM public.finance_customer_credit_uses WHERE settlement_id=v_u.settlement_id UNION ALL SELECT reversal_date,-amount FROM public.finance_customer_credit_uses WHERE settlement_id=v_u.settlement_id AND reversal_date IS NOT NULL),daily AS(SELECT day,sum(amount) AS amount FROM movements GROUP BY day),balances AS(SELECT sum(amount) OVER(ORDER BY day) AS amount FROM daily) SELECT 1 FROM balances WHERE amount<0 OR amount>v_receipt.amount) THEN RAISE EXCEPTION 'dated refunds exceed the original receipt'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=v_u.invoice_id AND org_id=v_c.org_id AND entity_id=v_c.entity_id AND customer_id=v_c.customer_id AND issue_date<=v_u.as_of AND accounting_status='POSTED') THEN RAISE EXCEPTION 'credit application invoice graph is invalid'; END IF;
  SELECT ar_account_id INTO v_offset FROM public.entity_invoice_account_controls WHERE entity_id=v_u.entity_id;
  PERFORM public.validate_customer_invoice_graph(v_u.invoice_id);PERFORM public.validate_settlement_capacity('ar',v_u.invoice_id);
 END IF;
 v_lines:=public.finance_pair_lines(v_liability,v_offset,v_u.amount);
 PERFORM public.assert_finance_journal(v_u.journal_id,v_u.org_id,v_u.entity_id,v_u.as_of,v_lines,v_u.reversal_journal);
 IF v_u.reversal_date IS NOT NULL THEN
  IF v_u.reversal_date<v_u.as_of OR NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_u.reversal_request AND org_id=v_u.org_id AND entity_id=v_u.entity_id AND kind='CUSTOMER_CREDIT_USE_REVERSE' AND payload->>'use_id'=v_u.id::text AND (payload->>'date')::date=v_u.reversal_date AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by) THEN RAISE EXCEPTION 'customer credit use reversal approval is invalid'; END IF;
  PERFORM public.assert_finance_journal(v_u.reversal_journal,v_u.org_id,v_u.entity_id,v_u.reversal_date,public.flip_finance_lines(v_lines),NULL,v_u.journal_id);
 ELSIF v_u.reversal_journal IS NOT NULL OR v_u.reversal_request IS NOT NULL THEN RAISE EXCEPTION 'incomplete customer credit use reversal'; END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.check_customer_credit_graph_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='finance_customer_credit_controls' THEN PERFORM public.validate_customer_credit_control_graph(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END);
 ELSIF TG_TABLE_NAME='finance_customer_credits' THEN PERFORM public.validate_customer_credit_graph(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END);
 ELSE PERFORM public.validate_customer_credit_use_graph(CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END);END IF;RETURN NULL;
END; $$;
CREATE OR REPLACE FUNCTION public.guard_customer_adjustment_sources()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_invoice uuid;v_id uuid;v_kind text;v_r public.finance_requests%ROWTYPE;
BEGIN
 IF TG_TABLE_NAME='journal_entries' THEN
  IF NEW.reversal_of_id IS NULL THEN RETURN NEW; END IF;
  SELECT id,'CUSTOMER_CREDIT_REVERSE' INTO v_id,v_kind FROM public.finance_customer_credits WHERE journal_id=NEW.reversal_of_id
   UNION ALL SELECT id,'CUSTOMER_CREDIT_USE_REVERSE' FROM public.finance_customer_credit_uses WHERE journal_id=NEW.reversal_of_id;
  IF v_id IS NULL THEN RETURN NEW; END IF;
  SELECT * INTO v_r FROM public.finance_requests WHERE id=nullif(current_setting('tapaano.finance_request',true),'')::uuid AND org_id=NEW.org_id AND entity_id=NEW.entity_id AND state='EXECUTING' AND decided_by=auth.uid() AND requested_by<>auth.uid();
  IF v_r.id IS NULL OR v_r.kind<>v_kind OR v_r.payload->>(CASE WHEN v_kind='CUSTOMER_CREDIT_REVERSE' THEN 'credit_id' ELSE 'use_id' END) IS DISTINCT FROM v_id::text THEN RAISE EXCEPTION 'customer adjustment journals require their linked independent correction'; END IF;
 ELSIF TG_TABLE_NAME='customer_credit_notes' THEN
  IF EXISTS(SELECT 1 FROM public.finance_customer_credits WHERE invoice_id=NEW.original_invoice_id AND reversal_date IS NULL) OR EXISTS(SELECT 1 FROM public.finance_customer_credit_uses WHERE invoice_id=NEW.original_invoice_id AND reversal_date IS NULL) THEN RAISE EXCEPTION 'use the customer adjustment workflow for an invoice with credit activity'; END IF;
 ELSE
  SELECT invoice_id INTO v_invoice FROM public.customer_receipts WHERE id=NEW.original_receipt_id;
  IF EXISTS(SELECT 1 FROM public.finance_customer_credits WHERE invoice_id=v_invoice AND reversal_date IS NULL) THEN RAISE EXCEPTION 'resolve customer credits and refunds before correcting their receipt'; END IF;
 END IF;RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS customer_adjustment_source ON public.journal_entries;
CREATE TRIGGER customer_adjustment_source BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_customer_adjustment_sources();
DROP TRIGGER IF EXISTS customer_adjustment_source ON public.customer_credit_notes;
CREATE TRIGGER customer_adjustment_source BEFORE INSERT ON public.customer_credit_notes FOR EACH ROW EXECUTE FUNCTION public.guard_customer_adjustment_sources();
DROP TRIGGER IF EXISTS customer_adjustment_source ON public.customer_receipt_corrections;
CREATE TRIGGER customer_adjustment_source BEFORE INSERT ON public.customer_receipt_corrections FOR EACH ROW EXECUTE FUNCTION public.guard_customer_adjustment_sources();

CREATE OR REPLACE FUNCTION public.get_customer_credit_balances(p_entity uuid,p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_control public.finance_customer_credit_controls%ROWTYPE;v_trial jsonb;v_expected numeric;v_ledger numeric;v_row record;
BEGIN
 v_trial:=public.get_entity_trial_balance(p_entity,DATE '0001-01-01',p_as_of);
 SELECT * INTO v_control FROM public.finance_customer_credit_controls WHERE entity_id=p_entity AND org_id=v_org;
 IF v_control.id IS NULL THEN RETURN jsonb_build_object('configured',false,'accountId',NULL,'expected','0.00','ledger','0.00','variance','0.00','reconciled',true); END IF;
 PERFORM public.validate_customer_credit_control_graph(v_control.id);
 FOR v_row IN SELECT id FROM public.finance_customer_credits WHERE entity_id=p_entity AND org_id=v_org LOOP PERFORM public.validate_customer_credit_graph(v_row.id); END LOOP;
 FOR v_row IN SELECT id FROM public.finance_customer_credit_uses WHERE entity_id=p_entity AND org_id=v_org LOOP PERFORM public.validate_customer_credit_use_graph(v_row.id); END LOOP;
 SELECT coalesce(sum(public.customer_credit_remaining(id,p_as_of)),0) INTO v_expected FROM public.finance_customer_credits WHERE entity_id=p_entity AND org_id=v_org AND as_of<=p_as_of;
 SELECT coalesce(sum((a->>'closingCredit')::numeric-(a->>'closingDebit')::numeric),0) INTO v_ledger FROM jsonb_array_elements(v_trial->'rows') a WHERE a->>'accountId'=v_control.liability_account_id::text;
 RETURN jsonb_build_object('configured',true,'accountId',v_control.liability_account_id,'expected',round(v_expected,2)::text,'ledger',round(v_ledger,2)::text,'variance',round(v_ledger-v_expected,2)::text,'reconciled',v_ledger=v_expected);
END; $$;
CREATE OR REPLACE FUNCTION public.get_customer_adjustments(p_entity uuid,p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_control jsonb;v_invoices jsonb;v_credits jsonb;v_currency text;v_result jsonb;
BEGIN
 v_control:=public.get_customer_credit_balances(p_entity,p_as_of);
 SELECT currency INTO v_currency FROM public.entities WHERE id=p_entity AND org_id=v_org;
 IF (SELECT count(*) FROM public.invoices WHERE entity_id=p_entity AND org_id=v_org AND accounting_status='POSTED')>5000 OR (SELECT count(*) FROM public.finance_customer_credits WHERE entity_id=p_entity AND org_id=v_org)>2000 THEN RAISE EXCEPTION 'customer adjustment report exceeds 5000 invoices or 2000 credits; partition the source history before onboarding larger volumes'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'number',i.invoice_number,'customerId',i.customer_id,'customerName',c.name,'date',i.issue_date,'original',i.total::text,'remaining',public.customer_invoice_remaining(i.id,p_as_of)::numeric(38,2)::text,
  'legacyCredited',EXISTS(SELECT 1 FROM public.customer_credit_notes WHERE original_invoice_id=i.id),'contractId',(SELECT contract_id FROM public.finance_contract_cycles WHERE invoice_id=i.id),
  'lines',(SELECT jsonb_agg(jsonb_build_object('id',l.id,'description',l.description,'original',l.line_total::text,'available',(l.line_total-coalesce((SELECT sum((a->>'amount')::numeric) FROM public.finance_customer_credits cr CROSS JOIN LATERAL jsonb_array_elements(cr.lines) a WHERE cr.invoice_id=i.id AND cr.as_of<=p_as_of AND (cr.reversal_date IS NULL OR cr.reversal_date>p_as_of) AND a->>'lineId'=l.id::text),0))::numeric(38,2)::text) ORDER BY l.line_number) FROM public.invoice_lines l WHERE l.invoice_id=i.id),
  'receipts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'kind',r.kind,'date',r.as_of,'amount',r.amount::text,'available',(r.amount-coalesce((SELECT sum(u.amount) FROM public.finance_customer_credit_uses u WHERE u.settlement_id=r.id AND u.as_of<=p_as_of AND (u.reversal_date IS NULL OR u.reversal_date>p_as_of)),0))::numeric(38,2)::text) ORDER BY r.as_of,r.id),'[]') FROM (
   SELECT r.id,'RECEIPT' AS kind,r.receipt_date AS as_of,r.amount FROM public.customer_receipts r WHERE r.invoice_id=i.id AND r.receipt_date<=p_as_of AND NOT EXISTS(SELECT 1 FROM public.customer_receipt_corrections WHERE original_receipt_id=r.id AND correction_date<=p_as_of)
   UNION ALL SELECT id,'REPLACEMENT',replacement_date,amount FROM public.customer_receipt_replacements WHERE invoice_id=i.id AND replacement_date<=p_as_of) r)
 ) ORDER BY i.issue_date,i.id),'[]') INTO v_invoices FROM public.invoices i JOIN public.customers c ON c.id=i.customer_id WHERE i.entity_id=p_entity AND i.org_id=v_org AND i.accounting_status='POSTED' AND i.issue_date<=p_as_of;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'invoiceId',c.invoice_id,'customerId',c.customer_id,'reference',c.reference,'date',c.as_of,'amount',c.amount::text,'arAmount',c.ar_amount::text,'balanceAmount',c.balance_amount::text,
  'remaining',public.customer_credit_remaining(c.id,p_as_of)::numeric(38,2)::text,'reversedOn',CASE WHEN c.reversal_date<=p_as_of THEN c.reversal_date END,'journalId',c.journal_id,'lines',c.lines,'obligations',c.obligations,
  'uses',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'kind',u.kind,'date',u.as_of,'amount',u.amount::text,'reference',u.reference,'invoiceId',u.invoice_id,'cashAccountId',u.cash_account_id,'settlementId',u.settlement_id,'settlementKind',u.settlement_kind,'journalId',u.journal_id,'reversedOn',CASE WHEN u.reversal_date<=p_as_of THEN u.reversal_date END) ORDER BY u.as_of,u.id),'[]') FROM public.finance_customer_credit_uses u WHERE u.credit_id=c.id AND u.as_of<=p_as_of)
 ) ORDER BY c.as_of,c.id),'[]') INTO v_credits FROM public.finance_customer_credits c WHERE c.org_id=v_org AND c.entity_id=p_entity AND c.as_of<=p_as_of;
 v_result:=jsonb_build_object('entityId',p_entity,'asOf',p_as_of,'currency',v_currency,'control',v_control,'invoices',v_invoices,'credits',v_credits);
 RETURN v_result||jsonb_build_object('revision',md5(v_result::text));
END; $$;

-- Extend verified AR movements; AP retains its existing document semantics.
CREATE OR REPLACE FUNCTION public.get_subledger_aging(
  p_entity_id uuid, p_kind text, p_as_of date, p_offset integer DEFAULT 0,
  p_page_size integer DEFAULT 100, p_expected_revision text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_adjustment record; v_org uuid:=public.get_user_org_id(); v_trial jsonb; v_control uuid; v_account uuid;
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
  IF p_kind='ar' THEN
    FOR v_adjustment IN SELECT id FROM public.finance_customer_credits WHERE org_id=v_org AND entity_id=p_entity_id LOOP PERFORM public.validate_customer_credit_graph(v_adjustment.id); END LOOP;
    FOR v_adjustment IN SELECT id FROM public.finance_customer_credit_uses WHERE org_id=v_org AND entity_id=p_entity_id LOOP PERFORM public.validate_customer_credit_use_graph(v_adjustment.id); END LOOP;
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
    UNION ALL
    SELECT NULL::uuid,i.id,i.customer_id,'manual_journal',m.as_of,-m.amount,i.currency,j.accounting_event_id,m.journal_id
    FROM public.invoices i CROSS JOIN LATERAL public.customer_adjustment_movements(i.id) m JOIN public.journal_entries j ON j.id=m.journal_id
    WHERE p_kind='ar' AND i.org_id=v_org AND i.entity_id=p_entity_id AND m.as_of<=p_as_of AND m.amount>0
    UNION ALL
    SELECT j.reversal_of_id,i.id,i.customer_id,'journal_reversal',m.as_of,-m.amount,i.currency,j.accounting_event_id,m.journal_id
    FROM public.invoices i CROSS JOIN LATERAL public.customer_adjustment_movements(i.id) m JOIN public.journal_entries j ON j.id=m.journal_id
    WHERE p_kind='ar' AND i.org_id=v_org AND i.entity_id=p_entity_id AND m.as_of<=p_as_of AND m.amount<0
  ), verified AS (
    SELECT m.*,
      d.id IS NULL OR d.party_id IS DISTINCT FROM m.party_id OR m.currency IS DISTINCT FROM d.currency
      OR m.effective_date<d.issue_date OR m.delta IS NULL OR abs(m.delta)<=0 OR abs(m.delta)>d.total
      OR (m.source_type IN ('customer_invoice','supplier_bill','customer_credit_note','supplier_bill_credit') AND abs(m.delta) IS DISTINCT FROM d.total)
      OR ev.id IS NULL OR j.id IS NULL OR control_net.amount IS DISTINCT FROM m.delta AS invalid
    FROM movements m LEFT JOIN documents d ON d.id=m.document_id
    LEFT JOIN public.accounting_events ev ON ev.id=m.accounting_event_id AND ev.org_id=v_org AND ev.entity_id=p_entity_id
      AND ev.source_type=m.source_type AND ev.source_id IS NOT DISTINCT FROM m.id AND ev.journal_entry_id=m.journal_entry_id
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


CREATE OR REPLACE FUNCTION public.contract_net_earned(p_cycle uuid,p_date date,p_evidence jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_agg(jsonb_build_object('key',e->>'key','amount',round((e->>'amount')::numeric-coalesce((SELECT sum((a->>'recognized')::numeric) FROM public.finance_customer_credits cr JOIN public.finance_contract_cycles s ON s.invoice_id=cr.invoice_id CROSS JOIN LATERAL jsonb_array_elements(cr.obligations) a WHERE s.id=p_cycle AND a->>'key'=e->>'key' AND cr.as_of<=p_date AND (cr.reversal_date IS NULL OR cr.reversal_date>p_date)),0),2)::text) ORDER BY n)
 FROM jsonb_array_elements(public.contract_earned(p_cycle,p_date,p_evidence)) WITH ORDINALITY AS x(e,n)
$$;
CREATE OR REPLACE FUNCTION public.get_contract_control_balances(p_entity_id uuid,p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_result jsonb;v_contract record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity_id AND org_id=v_org) OR p_as_of IS NULL OR p_as_of NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' THEN RAISE EXCEPTION 'contract control scope unavailable'; END IF;
 PERFORM public.get_entity_trial_balance(p_entity_id,DATE '0001-01-01',p_as_of);
 FOR v_contract IN SELECT id FROM public.finance_contracts WHERE entity_id=p_entity_id AND org_id=v_org LOOP PERFORM public.validate_contract_graph(v_contract.id); END LOOP;
 FOR v_contract IN SELECT id FROM public.finance_customer_credits WHERE entity_id=p_entity_id AND org_id=v_org LOOP PERFORM public.validate_customer_credit_graph(v_contract.id); END LOOP;
 WITH cycles AS (
  SELECT c.terms,s.*,CASE WHEN s.credit_date<=p_as_of THEN 0 ELSE coalesce((SELECT sum(amount) FROM public.finance_revenue_entries WHERE cycle_id=s.id AND as_of<=p_as_of),0)-(SELECT coalesce(sum((a->>'recognized')::numeric),0) FROM public.finance_customer_credits cr CROSS JOIN LATERAL jsonb_array_elements(cr.obligations) a WHERE cr.invoice_id=s.invoice_id AND cr.as_of<=p_as_of AND (cr.reversal_date IS NULL OR cr.reversal_date>p_as_of)) END AS earned,
   CASE WHEN s.credit_date<=p_as_of THEN 0 WHEN s.invoice_id IS NOT NULL AND s.invoice_date<=p_as_of THEN s.price-(SELECT coalesce(sum(amount),0) FROM public.finance_customer_credits cr WHERE cr.invoice_id=s.invoice_id AND cr.as_of<=p_as_of AND (cr.reversal_date IS NULL OR cr.reversal_date>p_as_of)) ELSE 0 END AS billed
  FROM public.finance_contracts c JOIN public.finance_contract_cycles s ON s.contract_id=c.id WHERE c.entity_id=p_entity_id AND c.org_id=v_org
 ), balances AS (
  SELECT (terms->>'deferred_account_id')::uuid AS account_id,'Deferred revenue' AS label,sum(greatest(billed-earned,0)) AS expected FROM cycles GROUP BY 1
  UNION ALL SELECT (terms->>'unbilled_account_id')::uuid,'Unbilled receivables',sum(greatest(earned-billed,0)) FROM cycles GROUP BY 1
 ), compared AS (
  SELECT b.*,a.code,a.name,coalesce((SELECT sum(CASE WHEN a.account_type='liability' THEN l.credit-l.debit ELSE l.debit-l.credit END)
   FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.org_id=v_org AND j.entity_id=p_entity_id AND j.status='posted' AND j.entry_date<=p_as_of AND l.account_id=b.account_id),0) AS ledger
  FROM balances b JOIN public.accounts a ON a.id=b.account_id
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('accountId',account_id,'code',code,'name',name,'label',label,'expected',round(expected,2)::text,'ledger',round(ledger,2)::text,'variance',round(ledger-expected,2)::text) ORDER BY code),'[]') INTO v_result FROM compared;
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.get_contract_finance(p_contract_id uuid,p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_c public.finance_contracts%ROWTYPE;v_cycle record;v_rows jsonb:='[]';v_billed numeric:=0;v_recognized numeric:=0;v_b numeric;v_r numeric;v_deferred numeric:=0;v_unbilled numeric:=0;v_schedule jsonb;
BEGIN
 SELECT * INTO v_c FROM public.finance_contracts WHERE id=p_contract_id AND org_id=v_org;
 IF v_c.id IS NULL THEN RAISE EXCEPTION 'contract unavailable'; END IF;
 IF p_as_of IS NULL OR p_as_of NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' THEN RAISE EXCEPTION 'invalid contract report date'; END IF;
 PERFORM public.validate_contract_graph(v_c.id);
 PERFORM public.get_entity_trial_balance(v_c.entity_id,DATE '0001-01-01',p_as_of);
 FOR v_cycle IN SELECT * FROM public.finance_contract_cycles WHERE contract_id=v_c.id ORDER BY cycle_number LOOP
  SELECT coalesce(sum(amount),0) INTO v_r FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id AND as_of<=p_as_of;
  v_b:=CASE WHEN v_cycle.invoice_id IS NOT NULL AND v_cycle.invoice_date<=p_as_of THEN v_cycle.price ELSE 0 END;
  IF v_cycle.credit_date<=p_as_of THEN v_b:=0;v_r:=0; END IF;
  v_b:=v_b-(SELECT coalesce(sum(amount),0) FROM public.finance_customer_credits cr WHERE cr.invoice_id=v_cycle.invoice_id AND cr.as_of<=p_as_of AND (cr.reversal_date IS NULL OR cr.reversal_date>p_as_of));
  v_r:=v_r-(SELECT coalesce(sum((a->>'recognized')::numeric),0) FROM public.finance_customer_credits cr CROSS JOIN LATERAL jsonb_array_elements(cr.obligations) a WHERE cr.invoice_id=v_cycle.invoice_id AND cr.as_of<=p_as_of AND (cr.reversal_date IS NULL OR cr.reversal_date>p_as_of));
  v_billed:=v_billed+v_b;v_recognized:=v_recognized+v_r;v_deferred:=v_deferred+greatest(v_b-v_r,0);v_unbilled:=v_unbilled+greatest(v_r-v_b,0);
  SELECT coalesce(jsonb_agg(jsonb_build_object('through',month_end,'cumulativeEarned',CASE WHEN v_cycle.usage_finalized THEN public.contract_net_earned(v_cycle.id,month_end,'[]') ELSE NULL END) ORDER BY month_end),'[]') INTO v_schedule
   FROM (SELECT least((date_trunc('month',d)+INTERVAL '1 month - 1 day')::date,v_cycle.ends_on) AS month_end FROM generate_series(date_trunc('month',v_cycle.starts_on::timestamp),date_trunc('month',v_cycle.ends_on::timestamp),INTERVAL '1 month') d) m;
  v_rows:=v_rows||jsonb_build_array(jsonb_build_object('id',v_cycle.id,'number',v_cycle.cycle_number,'startsOn',v_cycle.starts_on,'endsOn',v_cycle.ends_on,'price',v_cycle.price::text,'allocations',v_cycle.allocations,
   'usageFinalized',v_cycle.usage_finalized,'usage',public.contract_usage_snapshot(v_cycle.id),'invoiceId',v_cycle.invoice_id,'invoiceDate',v_cycle.invoice_date,'billingRequest',v_cycle.billing_request,'creditId',v_cycle.credit_id,'cancelled',v_cycle.cancel_request IS NOT NULL,
   'billed',round(v_b,2)::text,'recognized',round(v_r,2)::text,'deferred',round(greatest(v_b-v_r,0),2)::text,'unbilled',round(greatest(v_r-v_b,0),2)::text,'schedule',v_schedule,
   'recognitions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'date',as_of,'amount',amount::text,'allocations',allocations,'journalId',journal_id,'evidence',evidence) ORDER BY as_of,id) FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id),'[]'::jsonb)));
 END LOOP;
 RETURN jsonb_build_object('id',v_c.id,'reference',v_c.reference,'entityId',v_c.entity_id,'customerId',v_c.customer_id,'currency',v_c.currency,'terms',v_c.terms,'asOf',p_as_of,'billed',round(v_billed,2)::text,'recognized',round(v_recognized,2)::text,'deferred',round(v_deferred,2)::text,'unbilled',round(v_unbilled,2)::text,'cycles',v_rows,'controls',public.get_contract_control_balances(v_c.entity_id,p_as_of));
END; $$;


DO $$ BEGIN IF to_regprocedure('public.get_pre_customer_credit_close_check(uuid,date,date)') IS NULL THEN ALTER FUNCTION public.get_finance_close_check(uuid,date,date) RENAME TO get_pre_customer_credit_close_check;END IF;END; $$;
CREATE OR REPLACE FUNCTION public.get_finance_close_check(p_entity uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;v_control jsonb;
BEGIN
 v_result:=public.get_pre_customer_credit_close_check(p_entity,p_from,p_through)-'revision'-'generatedAt';v_control:=public.get_customer_credit_balances(p_entity,p_through);
 v_result:=v_result||jsonb_build_object('customerCredits',v_control,'canClose',(v_result->>'canClose')::boolean AND (v_control->>'reconciled')::boolean);
 RETURN v_result||jsonb_build_object('revision',md5(v_result::text),'generatedAt',statement_timestamp());
END; $$;
DO $$ DECLARE t text;f record;
BEGIN
 FOREACH t IN ARRAY ARRAY['finance_customer_credit_controls','finance_customer_credits','finance_customer_credit_uses'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(org_id=public.get_user_org_id())',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);
  EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);
  EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS customer_credit_graph ON public.%I',t);
  EXECUTE format('CREATE CONSTRAINT TRIGGER customer_credit_graph AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_customer_credit_graph_trigger()',t);
 END LOOP;
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
  ('validate_finance_extension','execute_finance_extension','finance_source_snapshot','validate_statement_extension','execute_statement_extension','statement_source_snapshot','customer_adjustment_movements','customer_invoice_movements','customer_invoice_remaining','validate_settlement_capacity','validate_pre_credit_settlement_capacity','customer_credit_remaining','original_contract_earned','contract_earned','contract_net_earned','customer_credit_preview','validate_customer_credit_control_graph','validate_customer_credit_graph','validate_customer_credit_use_graph','check_customer_credit_graph_trigger','guard_customer_adjustment_sources','get_customer_credit_balances','get_customer_adjustments','get_pre_customer_credit_close_check','get_finance_close_check','get_subledger_aging','get_contract_control_balances','get_contract_finance') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname IN ('get_customer_credit_balances','get_customer_adjustments','get_finance_close_check','get_subledger_aging','get_contract_control_balances','get_contract_finance') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END; $$;
COMMIT;
