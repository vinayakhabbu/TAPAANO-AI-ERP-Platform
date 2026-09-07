BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.validate_close_extension(uuid,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.validate_finance_extension(uuid,text,jsonb) RENAME TO validate_close_extension;
  ALTER FUNCTION public.execute_finance_extension(public.finance_requests) RENAME TO execute_close_extension;
  ALTER FUNCTION public.finance_source_snapshot(uuid,text,jsonb) RENAME TO close_source_snapshot;
 END IF;
 IF to_regprocedure('public.get_pre_intercompany_close_check(uuid,date,date)') IS NULL THEN
  ALTER FUNCTION public.get_finance_close_check(uuid,date,date) RENAME TO get_pre_intercompany_close_check;
 END IF;
END; $$;

CREATE TABLE IF NOT EXISTS public.finance_intercompany (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,counterparty_id uuid NOT NULL,
 reference text NOT NULL,kind text NOT NULL CHECK(kind IN ('SERVICE','FUNDING')),currency text NOT NULL,
 as_of date NOT NULL,amount numeric(15,2) NOT NULL CHECK(amount>0),terms jsonb NOT NULL,request_id uuid NOT NULL,
 seller_journal uuid NOT NULL UNIQUE REFERENCES public.journal_entries(id),buyer_journal uuid NOT NULL UNIQUE REFERENCES public.journal_entries(id),
 reversal_date date,reversal_request uuid,seller_reversal uuid UNIQUE REFERENCES public.journal_entries(id),buyer_reversal uuid UNIQUE REFERENCES public.journal_entries(id),
 UNIQUE(org_id,id),UNIQUE(org_id,entity_id,reference),UNIQUE(request_id),CHECK(entity_id<>counterparty_id),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),FOREIGN KEY(org_id,counterparty_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),FOREIGN KEY(org_id,reversal_request) REFERENCES public.finance_requests(org_id,id),
 CHECK((reversal_request IS NULL AND reversal_date IS NULL AND seller_reversal IS NULL AND buyer_reversal IS NULL) OR
       (reversal_request IS NOT NULL AND reversal_date IS NOT NULL AND reversal_date>=as_of AND seller_reversal IS NOT NULL AND buyer_reversal IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.finance_intercompany_settlements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,transfer_id uuid NOT NULL,
 as_of date NOT NULL,amount numeric(15,2) NOT NULL CHECK(amount>0),seller_cash uuid NOT NULL,buyer_cash uuid NOT NULL,request_id uuid NOT NULL,
 seller_journal uuid NOT NULL UNIQUE REFERENCES public.journal_entries(id),buyer_journal uuid NOT NULL UNIQUE REFERENCES public.journal_entries(id),
 reversal_date date,reversal_request uuid,seller_reversal uuid UNIQUE REFERENCES public.journal_entries(id),buyer_reversal uuid UNIQUE REFERENCES public.journal_entries(id),
 UNIQUE(org_id,id),UNIQUE(request_id),FOREIGN KEY(org_id,transfer_id) REFERENCES public.finance_intercompany(org_id,id),
 FOREIGN KEY(org_id,seller_cash) REFERENCES public.accounts(org_id,id),FOREIGN KEY(org_id,buyer_cash) REFERENCES public.accounts(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),FOREIGN KEY(org_id,reversal_request) REFERENCES public.finance_requests(org_id,id),
 CHECK((reversal_request IS NULL AND reversal_date IS NULL AND seller_reversal IS NULL AND buyer_reversal IS NULL) OR
       (reversal_request IS NOT NULL AND reversal_date IS NOT NULL AND reversal_date>=as_of AND seller_reversal IS NOT NULL AND buyer_reversal IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS finance_intercompany_counterparty ON public.finance_intercompany(org_id,counterparty_id,as_of);
CREATE INDEX IF NOT EXISTS finance_intercompany_settlement_source ON public.finance_intercompany_settlements(transfer_id,as_of);

CREATE OR REPLACE FUNCTION public.finance_pair_lines(p_debit uuid,p_credit uuid,p_amount numeric)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_array(jsonb_build_object('account_id',p_debit,'debit',round(p_amount,2)::text,'credit','0.00'),jsonb_build_object('account_id',p_credit,'debit','0.00','credit',round(p_amount,2)::text))
$$;
CREATE OR REPLACE FUNCTION public.intercompany_settled(p_transfer uuid,p_date date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(sum(CASE WHEN as_of<=p_date THEN amount ELSE 0 END-CASE WHEN reversal_date<=p_date THEN amount ELSE 0 END),0) FROM public.finance_intercompany_settlements WHERE transfer_id=p_transfer
$$;
CREATE OR REPLACE FUNCTION public.intercompany_control_account(p_entity uuid,p_account uuid,p_type text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account AND org_id=public.get_user_org_id() AND is_active AND account_type::text=p_type)
 AND NOT EXISTS(SELECT 1 FROM public.cash_registers WHERE entity_id=p_entity AND account_id=p_account)
 AND NOT EXISTS(SELECT 1 FROM public.entity_invoice_account_controls WHERE entity_id=p_entity AND ar_account_id=p_account)
 AND NOT EXISTS(SELECT 1 FROM public.entity_supplier_bill_account_controls WHERE entity_id=p_entity AND ap_account_id=p_account)
 AND NOT EXISTS(SELECT 1 FROM public.entity_customer_receipt_controls WHERE entity_id=p_entity AND cash_account_id=p_account)
 AND NOT EXISTS(SELECT 1 FROM public.entity_supplier_payment_controls WHERE entity_id=p_entity AND cash_account_id=p_account)
 AND NOT EXISTS(SELECT 1 FROM public.finance_connections WHERE entity_id=p_entity AND clearing_account_id=p_account)
 AND NOT EXISTS(SELECT 1 FROM public.finance_contracts WHERE entity_id=p_entity AND (terms->>'unbilled_account_id'=p_account::text OR terms->>'deferred_account_id'=p_account::text))
 AND NOT EXISTS(SELECT 1 FROM public.finance_schedules s LEFT JOIN public.journal_lines l ON l.id=s.source_line_id WHERE s.entity_id=p_entity AND s.state<>'CANCELLED' AND (l.account_id=p_account OR s.terms->>'accumulated_account_id'=p_account::text))
$$;
CREATE OR REPLACE FUNCTION public.require_intercompany_cash(p_entity uuid,p_account uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.cash_registers r JOIN public.accounts a ON a.id=r.account_id AND a.org_id=r.org_id WHERE r.entity_id=p_entity AND r.org_id=public.get_user_org_id() AND r.account_id=p_account AND a.is_active AND a.account_type='asset') THEN RAISE EXCEPTION 'intercompany cash account requires an active registered bank source'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_t public.finance_intercompany%ROWTYPE;v_s public.finance_intercompany_settlements%ROWTYPE;
 v_other uuid;v_date date;v_amount numeric;v_currency text;v_lines jsonb;v_day date;
BEGIN
 IF p_kind NOT IN ('INTERCOMPANY_CREATE','INTERCOMPANY_SETTLE','INTERCOMPANY_UNSETTLE','INTERCOMPANY_REVERSE') THEN RETURN public.validate_close_extension(p_entity,p_kind,p_payload); END IF;
 IF coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'intercompany accounting date required'; END IF;
 v_date:=(p_payload->>'date')::date;
 IF v_date<DATE '0001-01-01' OR v_date>CURRENT_DATE THEN RAISE EXCEPTION 'intercompany accounting date cannot be future or outside the supported calendar'; END IF;
 IF p_kind='INTERCOMPANY_CREATE' THEN
  IF p_payload-ARRAY['reference','kind','counterparty_entity_id','date','currency','amount','due_from_account_id','due_to_account_id','seller_offset_account_id','buyer_offset_account_id']<>'{}'::jsonb OR
   coalesce(p_payload->>'kind','') NOT IN ('SERVICE','FUNDING') OR length(coalesce(p_payload->>'reference','')) NOT BETWEEN 1 AND 80 OR jsonb_typeof(p_payload->'amount') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'invalid intercompany source terms'; END IF;
  v_amount:=public.cash_amount(p_payload->>'amount');v_other:=(p_payload->>'counterparty_entity_id')::uuid;
  SELECT currency INTO v_currency FROM public.entities WHERE id=p_entity AND org_id=v_org;
  IF v_amount<=0 OR v_other=p_entity OR v_currency IS DISTINCT FROM p_payload->>'currency' OR NOT EXISTS(SELECT 1 FROM public.entities WHERE id=v_other AND org_id=v_org AND currency=v_currency) THEN RAISE EXCEPTION 'two distinct tenant entities in the same functional currency are required'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_intercompany WHERE org_id=v_org AND entity_id=p_entity AND reference=p_payload->>'reference') THEN RAISE EXCEPTION 'intercompany reference already exists'; END IF;
  IF NOT public.intercompany_control_account(p_entity,(p_payload->>'due_from_account_id')::uuid,'asset') OR NOT public.intercompany_control_account(v_other,(p_payload->>'due_to_account_id')::uuid,'liability') THEN RAISE EXCEPTION 'dedicated active intercompany due-from and due-to accounts required'; END IF;
  IF p_payload->>'kind'='SERVICE' THEN
   IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(p_payload->>'seller_offset_account_id')::uuid AND org_id=v_org AND is_active AND account_type='revenue') OR
      NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(p_payload->>'buyer_offset_account_id')::uuid AND org_id=v_org AND is_active AND account_type='expense') THEN RAISE EXCEPTION 'service requires active revenue and expense accounts'; END IF;
  ELSE
   PERFORM public.require_intercompany_cash(p_entity,(p_payload->>'seller_offset_account_id')::uuid);PERFORM public.require_intercompany_cash(v_other,(p_payload->>'buyer_offset_account_id')::uuid);
  END IF;
 ELSE
  IF p_kind='INTERCOMPANY_UNSETTLE' THEN
   IF p_payload-ARRAY['settlement_id','date']<>'{}'::jsonb THEN RAISE EXCEPTION 'unknown intercompany correction fields'; END IF;
   SELECT * INTO v_s FROM public.finance_intercompany_settlements WHERE id=(p_payload->>'settlement_id')::uuid AND org_id=v_org;
   IF v_s.id IS NULL OR v_s.reversal_request IS NOT NULL OR v_date<v_s.as_of THEN RAISE EXCEPTION 'unreversed settlement and valid correction date required'; END IF;
   SELECT * INTO v_t FROM public.finance_intercompany WHERE id=v_s.transfer_id AND org_id=v_org AND entity_id=p_entity;
  ELSE SELECT * INTO v_t FROM public.finance_intercompany WHERE id=(p_payload->>'transfer_id')::uuid AND org_id=v_org AND entity_id=p_entity; END IF;
  IF v_t.id IS NULL OR v_t.reversal_request IS NOT NULL OR v_date<v_t.as_of THEN RAISE EXCEPTION 'open intercompany source and valid date required'; END IF;
  v_other:=v_t.counterparty_id;
  IF p_kind='INTERCOMPANY_SETTLE' THEN
   IF p_payload-ARRAY['transfer_id','date','amount','seller_cash_account_id','buyer_cash_account_id']<>'{}'::jsonb OR jsonb_typeof(p_payload->'amount') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'unknown settlement fields or inexact amount'; END IF;
   v_amount:=public.cash_amount(p_payload->>'amount');IF v_amount<=0 THEN RAISE EXCEPTION 'positive settlement amount required'; END IF;
   PERFORM public.require_intercompany_cash(p_entity,(p_payload->>'seller_cash_account_id')::uuid);PERFORM public.require_intercompany_cash(v_other,(p_payload->>'buyer_cash_account_id')::uuid);
   IF p_payload->>'seller_cash_account_id'=v_t.terms->>'due_from_account_id' THEN RAISE EXCEPTION 'cash and intercompany controls must be distinct'; END IF;
   FOR v_day IN SELECT v_date UNION SELECT as_of FROM public.finance_intercompany_settlements WHERE transfer_id=v_t.id AND as_of>=v_date UNION SELECT reversal_date FROM public.finance_intercompany_settlements WHERE transfer_id=v_t.id AND reversal_date>=v_date LOOP
    IF public.intercompany_settled(v_t.id,v_day)+v_amount>v_t.amount THEN RAISE EXCEPTION 'settlements exceed intercompany capacity at an accounting date'; END IF;
   END LOOP;
  ELSIF p_kind='INTERCOMPANY_REVERSE' THEN
   IF p_payload-ARRAY['transfer_id','date']<>'{}'::jsonb OR public.intercompany_settled(v_t.id,DATE '9999-12-31')<>0 OR EXISTS(SELECT 1 FROM public.finance_intercompany_settlements WHERE transfer_id=v_t.id AND greatest(as_of,reversal_date)>v_date) THEN RAISE EXCEPTION 'correct all settlements and use a date after their history before reversing the transfer'; END IF;
  END IF;
 END IF;
 PERFORM public.get_entity_trial_balance(p_entity,DATE '0001-01-01',v_date);PERFORM public.get_entity_trial_balance(v_other,DATE '0001-01-01',v_date);
 IF NOT EXISTS(SELECT 1 FROM public.accounting_periods WHERE entity_id=p_entity AND org_id=v_org AND v_date BETWEEN period_start AND period_end AND status='OPEN') OR
    NOT EXISTS(SELECT 1 FROM public.accounting_periods WHERE entity_id=v_other AND org_id=v_org AND v_date BETWEEN period_start AND period_end AND status='OPEN') THEN RAISE EXCEPTION 'both intercompany accounting periods must be open'; END IF;
 RETURN p_payload;
END; $$;

CREATE OR REPLACE FUNCTION public.finance_source_snapshot(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_t public.finance_intercompany%ROWTYPE;v_id uuid;v_rows jsonb;
BEGIN
 IF p_kind='INTERCOMPANY_CREATE' THEN
  SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'currency',currency) ORDER BY id) INTO v_rows FROM public.entities WHERE org_id=public.get_user_org_id() AND id IN (p_entity,(p_payload->>'counterparty_entity_id')::uuid);
  RETURN jsonb_build_object('entities',v_rows,'seller_lines',public.finance_pair_lines((p_payload->>'due_from_account_id')::uuid,(p_payload->>'seller_offset_account_id')::uuid,(p_payload->>'amount')::numeric),
   'buyer_lines',public.finance_pair_lines((p_payload->>'buyer_offset_account_id')::uuid,(p_payload->>'due_to_account_id')::uuid,(p_payload->>'amount')::numeric));
 ELSIF p_kind IN ('INTERCOMPANY_SETTLE','INTERCOMPANY_UNSETTLE','INTERCOMPANY_REVERSE') THEN
  IF p_kind='INTERCOMPANY_UNSETTLE' THEN SELECT transfer_id INTO v_id FROM public.finance_intercompany_settlements WHERE id=(p_payload->>'settlement_id')::uuid AND org_id=public.get_user_org_id(); ELSE v_id:=(p_payload->>'transfer_id')::uuid; END IF;
  SELECT * INTO v_t FROM public.finance_intercompany WHERE id=v_id AND entity_id=p_entity AND org_id=public.get_user_org_id();
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'date',as_of,'amount',amount::text,'seller_cash',seller_cash,'buyer_cash',buyer_cash,'reversed_on',reversal_date) ORDER BY as_of,id),'[]') INTO v_rows FROM public.finance_intercompany_settlements WHERE transfer_id=v_t.id;
  RETURN jsonb_build_object('transfer',v_t.id,'terms',v_t.terms,'reversed_on',v_t.reversal_date,'settlements',v_rows,'settled_through_date',round(public.intercompany_settled(v_t.id,(p_payload->>'date')::date),2)::text);
 END IF;
 RETURN public.close_source_snapshot(p_entity,p_kind,p_payload);
END; $$;

CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p jsonb:=p_request.payload;v_t public.finance_intercompany%ROWTYPE;v_s public.finance_intercompany_settlements%ROWTYPE;v_date date;v_amount numeric;v_a uuid;v_b uuid;v_id uuid;v_key text:='finance:'||p_request.id;
BEGIN
 IF p_request.kind NOT IN ('INTERCOMPANY_CREATE','INTERCOMPANY_SETTLE','INTERCOMPANY_UNSETTLE','INTERCOMPANY_REVERSE') THEN RETURN public.execute_close_extension(p_request); END IF;
 v_date:=(v_p->>'date')::date;
 IF p_request.kind='INTERCOMPANY_CREATE' THEN
  v_amount:=(v_p->>'amount')::numeric;
  v_a:=public.post_manual_journal(p_request.entity_id,'IC-SELLER-'||p_request.id,v_date,p_request.reason,public.finance_pair_lines((v_p->>'due_from_account_id')::uuid,(v_p->>'seller_offset_account_id')::uuid,v_amount),v_key||':seller');
  v_b:=public.post_manual_journal((v_p->>'counterparty_entity_id')::uuid,'IC-BUYER-'||p_request.id,v_date,p_request.reason,public.finance_pair_lines((v_p->>'buyer_offset_account_id')::uuid,(v_p->>'due_to_account_id')::uuid,v_amount),v_key||':buyer');
  INSERT INTO public.finance_intercompany(org_id,entity_id,counterparty_id,reference,kind,currency,as_of,amount,terms,request_id,seller_journal,buyer_journal)
   VALUES(p_request.org_id,p_request.entity_id,(v_p->>'counterparty_entity_id')::uuid,v_p->>'reference',v_p->>'kind',v_p->>'currency',v_date,v_amount,v_p,p_request.id,v_a,v_b) RETURNING id INTO v_id;
  RETURN jsonb_build_object('transferId',v_id,'sellerJournal',v_a,'buyerJournal',v_b);
 END IF;
 IF p_request.kind='INTERCOMPANY_UNSETTLE' THEN SELECT * INTO v_s FROM public.finance_intercompany_settlements WHERE id=(v_p->>'settlement_id')::uuid;SELECT * INTO v_t FROM public.finance_intercompany WHERE id=v_s.transfer_id;
 ELSE SELECT * INTO v_t FROM public.finance_intercompany WHERE id=(v_p->>'transfer_id')::uuid; END IF;
 IF p_request.kind='INTERCOMPANY_SETTLE' THEN
  v_amount:=(v_p->>'amount')::numeric;
  v_a:=public.post_manual_journal(v_t.entity_id,'IC-RECEIPT-'||p_request.id,v_date,p_request.reason,public.finance_pair_lines((v_p->>'seller_cash_account_id')::uuid,(v_t.terms->>'due_from_account_id')::uuid,v_amount),v_key||':seller');
  v_b:=public.post_manual_journal(v_t.counterparty_id,'IC-PAYMENT-'||p_request.id,v_date,p_request.reason,public.finance_pair_lines((v_t.terms->>'due_to_account_id')::uuid,(v_p->>'buyer_cash_account_id')::uuid,v_amount),v_key||':buyer');
  INSERT INTO public.finance_intercompany_settlements(org_id,transfer_id,as_of,amount,seller_cash,buyer_cash,request_id,seller_journal,buyer_journal)
   VALUES(p_request.org_id,v_t.id,v_date,v_amount,(v_p->>'seller_cash_account_id')::uuid,(v_p->>'buyer_cash_account_id')::uuid,p_request.id,v_a,v_b) RETURNING id INTO v_id;
  RETURN jsonb_build_object('settlementId',v_id,'sellerJournal',v_a,'buyerJournal',v_b);
 ELSIF p_request.kind='INTERCOMPANY_UNSETTLE' THEN
  v_a:=public.reverse_posted_journal(v_s.seller_journal,v_date,left(p_request.reason,240),v_key||':seller');v_b:=public.reverse_posted_journal(v_s.buyer_journal,v_date,left(p_request.reason,240),v_key||':buyer');
  UPDATE public.finance_intercompany_settlements SET reversal_date=v_date,reversal_request=p_request.id,seller_reversal=v_a,buyer_reversal=v_b WHERE id=v_s.id;
  RETURN jsonb_build_object('settlementId',v_s.id,'sellerReversal',v_a,'buyerReversal',v_b);
 ELSE
  v_a:=public.reverse_posted_journal(v_t.seller_journal,v_date,left(p_request.reason,240),v_key||':seller');v_b:=public.reverse_posted_journal(v_t.buyer_journal,v_date,left(p_request.reason,240),v_key||':buyer');
  UPDATE public.finance_intercompany SET reversal_date=v_date,reversal_request=p_request.id,seller_reversal=v_a,buyer_reversal=v_b WHERE id=v_t.id;
  RETURN jsonb_build_object('transferId',v_t.id,'sellerReversal',v_a,'buyerReversal',v_b);
 END IF;
END; $$;

-- The only additional entity authority is the validated counterparty of this exact request.
CREATE OR REPLACE FUNCTION public.intercompany_request_counterparty(p_request public.finance_requests)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 IF p_request.kind='INTERCOMPANY_CREATE' THEN RETURN (p_request.payload->>'counterparty_entity_id')::uuid;
 ELSIF p_request.kind IN ('INTERCOMPANY_SETTLE','INTERCOMPANY_REVERSE') THEN
  SELECT counterparty_id INTO v_id FROM public.finance_intercompany WHERE id=(p_request.payload->>'transfer_id')::uuid AND org_id=p_request.org_id AND entity_id=p_request.entity_id;
 ELSIF p_request.kind='INTERCOMPANY_UNSETTLE' THEN
  SELECT t.counterparty_id INTO v_id FROM public.finance_intercompany t JOIN public.finance_intercompany_settlements s ON s.transfer_id=t.id WHERE s.id=(p_request.payload->>'settlement_id')::uuid AND t.org_id=p_request.org_id AND t.entity_id=p_request.entity_id;
 END IF;RETURN v_id;
END; $$;
CREATE OR REPLACE FUNCTION public.guard_finance_approval_posting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_required boolean;v_r public.finance_requests%ROWTYPE;
BEGIN
 SELECT CASE WHEN NEW.source_module='gl' THEN journals_required ELSE payments_required END INTO v_required FROM public.finance_approval_policies WHERE entity_id=NEW.entity_id AND org_id=NEW.org_id;
 IF coalesce(v_required,false) AND NEW.source_module IN ('gl','ap_payment','ap_payment_correction','ap_payment_replacement') THEN
  SELECT * INTO v_r FROM public.finance_requests WHERE id=nullif(current_setting('tapaano.finance_request',true),'')::uuid AND org_id=NEW.org_id AND state='EXECUTING' AND decided_by=auth.uid() AND requested_by<>auth.uid();
  IF v_r.id IS NULL OR (v_r.entity_id<>NEW.entity_id AND NOT coalesce(NEW.source_module='gl' AND public.intercompany_request_counterparty(v_r)=NEW.entity_id,false)) THEN RAISE EXCEPTION 'independent finance approval is required for this posting'; END IF;
 END IF;RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.guard_intercompany_reversal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_transfer uuid;v_settlement uuid;v_r public.finance_requests%ROWTYPE;
BEGIN
 IF NEW.reversal_of_id IS NULL THEN RETURN NEW; END IF;
 SELECT id INTO v_transfer FROM public.finance_intercompany WHERE NEW.reversal_of_id IN (seller_journal,buyer_journal);
 SELECT id INTO v_settlement FROM public.finance_intercompany_settlements WHERE NEW.reversal_of_id IN (seller_journal,buyer_journal);
 IF v_transfer IS NULL AND v_settlement IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO v_r FROM public.finance_requests WHERE id=nullif(current_setting('tapaano.finance_request',true),'')::uuid AND org_id=NEW.org_id AND state='EXECUTING' AND decided_by=auth.uid() AND requested_by<>auth.uid();
 IF v_r.id IS NULL OR NOT ((v_transfer IS NOT NULL AND v_r.kind='INTERCOMPANY_REVERSE' AND v_r.payload->>'transfer_id'=v_transfer::text) OR (v_settlement IS NOT NULL AND v_r.kind='INTERCOMPANY_UNSETTLE' AND v_r.payload->>'settlement_id'=v_settlement::text)) THEN RAISE EXCEPTION 'intercompany journals require a linked bilateral correction'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS intercompany_journal_reversal ON public.journal_entries;
CREATE TRIGGER intercompany_journal_reversal BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_intercompany_reversal();

CREATE OR REPLACE FUNCTION public.validate_intercompany_graph(p_transfer uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_t public.finance_intercompany%ROWTYPE;v_s public.finance_intercompany_settlements%ROWTYPE;v_r public.finance_requests%ROWTYPE;v_a jsonb;v_b jsonb;v_day date;v_net numeric;
BEGIN
 SELECT * INTO v_t FROM public.finance_intercompany WHERE id=p_transfer;
 IF v_t.id IS NULL OR v_t.amount IS DISTINCT FROM (v_t.terms->>'amount')::numeric OR v_t.as_of IS DISTINCT FROM (v_t.terms->>'date')::date OR v_t.counterparty_id IS DISTINCT FROM (v_t.terms->>'counterparty_entity_id')::uuid OR v_t.kind IS DISTINCT FROM v_t.terms->>'kind' OR v_t.currency IS DISTINCT FROM v_t.terms->>'currency' OR v_t.reference IS DISTINCT FROM v_t.terms->>'reference' THEN RAISE EXCEPTION 'intercompany source terms mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_t.request_id AND org_id=v_t.org_id AND entity_id=v_t.entity_id AND kind='INTERCOMPANY_CREATE' AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by AND payload=v_t.terms) THEN RAISE EXCEPTION 'intercompany approval lineage mismatch'; END IF;
 IF (SELECT count(*) FROM public.entities WHERE id IN (v_t.entity_id,v_t.counterparty_id) AND org_id=v_t.org_id AND currency=v_t.currency)<>2 THEN RAISE EXCEPTION 'intercompany entity currency mismatch'; END IF;
 v_a:=public.finance_pair_lines((v_t.terms->>'due_from_account_id')::uuid,(v_t.terms->>'seller_offset_account_id')::uuid,v_t.amount);v_b:=public.finance_pair_lines((v_t.terms->>'buyer_offset_account_id')::uuid,(v_t.terms->>'due_to_account_id')::uuid,v_t.amount);
 PERFORM public.assert_finance_journal(v_t.seller_journal,v_t.org_id,v_t.entity_id,v_t.as_of,v_a,v_t.seller_reversal);PERFORM public.assert_finance_journal(v_t.buyer_journal,v_t.org_id,v_t.counterparty_id,v_t.as_of,v_b,v_t.buyer_reversal);
 IF v_t.reversal_request IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_t.reversal_request AND org_id=v_t.org_id AND entity_id=v_t.entity_id AND kind='INTERCOMPANY_REVERSE' AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by AND payload=jsonb_build_object('transfer_id',v_t.id,'date',v_t.reversal_date)) THEN RAISE EXCEPTION 'intercompany reversal approval mismatch'; END IF;
  PERFORM public.assert_finance_journal(v_t.seller_reversal,v_t.org_id,v_t.entity_id,v_t.reversal_date,public.flip_finance_lines(v_a),NULL,v_t.seller_journal);PERFORM public.assert_finance_journal(v_t.buyer_reversal,v_t.org_id,v_t.counterparty_id,v_t.reversal_date,public.flip_finance_lines(v_b),NULL,v_t.buyer_journal);
 END IF;
 FOR v_s IN SELECT * FROM public.finance_intercompany_settlements WHERE transfer_id=v_t.id LOOP
  SELECT * INTO v_r FROM public.finance_requests WHERE id=v_s.request_id AND org_id=v_t.org_id AND entity_id=v_t.entity_id AND kind='INTERCOMPANY_SETTLE' AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by;
  IF v_s.org_id<>v_t.org_id OR v_r.id IS NULL OR v_s.as_of<v_t.as_of OR v_s.amount IS DISTINCT FROM (v_r.payload->>'amount')::numeric OR v_s.as_of IS DISTINCT FROM (v_r.payload->>'date')::date OR v_s.transfer_id IS DISTINCT FROM (v_r.payload->>'transfer_id')::uuid OR v_s.seller_cash IS DISTINCT FROM (v_r.payload->>'seller_cash_account_id')::uuid OR v_s.buyer_cash IS DISTINCT FROM (v_r.payload->>'buyer_cash_account_id')::uuid THEN RAISE EXCEPTION 'intercompany settlement source mismatch'; END IF;
  v_a:=public.finance_pair_lines(v_s.seller_cash,(v_t.terms->>'due_from_account_id')::uuid,v_s.amount);v_b:=public.finance_pair_lines((v_t.terms->>'due_to_account_id')::uuid,v_s.buyer_cash,v_s.amount);
  PERFORM public.assert_finance_journal(v_s.seller_journal,v_t.org_id,v_t.entity_id,v_s.as_of,v_a,v_s.seller_reversal);PERFORM public.assert_finance_journal(v_s.buyer_journal,v_t.org_id,v_t.counterparty_id,v_s.as_of,v_b,v_s.buyer_reversal);
  IF v_s.reversal_request IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_s.reversal_request AND org_id=v_t.org_id AND entity_id=v_t.entity_id AND kind='INTERCOMPANY_UNSETTLE' AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by AND payload=jsonb_build_object('settlement_id',v_s.id,'date',v_s.reversal_date)) THEN RAISE EXCEPTION 'intercompany settlement correction approval mismatch'; END IF;
   PERFORM public.assert_finance_journal(v_s.seller_reversal,v_t.org_id,v_t.entity_id,v_s.reversal_date,public.flip_finance_lines(v_a),NULL,v_s.seller_journal);PERFORM public.assert_finance_journal(v_s.buyer_reversal,v_t.org_id,v_t.counterparty_id,v_s.reversal_date,public.flip_finance_lines(v_b),NULL,v_s.buyer_journal);
  END IF;
  IF v_t.reversal_date IS NOT NULL AND (v_s.reversal_date IS NULL OR greatest(v_s.as_of,v_s.reversal_date)>v_t.reversal_date) THEN RAISE EXCEPTION 'reversed intercompany source has unsettled history'; END IF;
 END LOOP;
 FOR v_day IN SELECT as_of FROM public.finance_intercompany_settlements WHERE transfer_id=v_t.id UNION SELECT reversal_date FROM public.finance_intercompany_settlements WHERE transfer_id=v_t.id AND reversal_date IS NOT NULL LOOP
  v_net:=public.intercompany_settled(v_t.id,v_day);IF v_net<0 OR v_net>v_t.amount THEN RAISE EXCEPTION 'intercompany settlement capacity is invalid'; END IF;
 END LOOP;
END; $$;
CREATE OR REPLACE FUNCTION public.check_intercompany_graph_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='finance_intercompany' THEN PERFORM public.validate_intercompany_graph(NEW.id);ELSE PERFORM public.validate_intercompany_graph(NEW.transfer_id);END IF;RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS intercompany_graph ON public.finance_intercompany;
CREATE CONSTRAINT TRIGGER intercompany_graph AFTER INSERT OR UPDATE ON public.finance_intercompany DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_intercompany_graph_trigger();
DROP TRIGGER IF EXISTS intercompany_graph ON public.finance_intercompany_settlements;
CREATE CONSTRAINT TRIGGER intercompany_graph AFTER INSERT OR UPDATE ON public.finance_intercompany_settlements DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_intercompany_graph_trigger();

CREATE OR REPLACE FUNCTION public.get_intercompany_report(p_entity uuid,p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_t public.finance_intercompany%ROWTYPE;v_trial jsonb;v_rows jsonb;v_controls jsonb;v_result jsonb;
BEGIN
 v_trial:=public.get_entity_trial_balance(p_entity,DATE '0001-01-01',p_as_of);
 IF (SELECT count(*) FROM public.finance_intercompany WHERE org_id=v_org AND p_entity IN (entity_id,counterparty_id))>2000 THEN RAISE EXCEPTION 'intercompany report exceeds 2000 source transfers; request a qualified larger report'; END IF;
 FOR v_t IN SELECT * FROM public.finance_intercompany WHERE org_id=v_org AND p_entity IN (entity_id,counterparty_id) LOOP PERFORM public.validate_intercompany_graph(v_t.id);END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'sellerId',t.entity_id,'buyerId',t.counterparty_id,'reference',t.reference,'kind',t.kind,'date',t.as_of,'amount',t.amount::text,'reversedOn',t.reversal_date,'terms',t.terms,
  'outstanding',round(CASE WHEN t.as_of>p_as_of OR t.reversal_date<=p_as_of THEN 0 ELSE t.amount-public.intercompany_settled(t.id,p_as_of) END,2)::text,
  'settlements',coalesce((SELECT jsonb_agg(jsonb_build_object('id',s.id,'date',s.as_of,'amount',s.amount::text,'reversedOn',s.reversal_date,'sellerJournal',s.seller_journal,'buyerJournal',s.buyer_journal) ORDER BY s.as_of,s.id) FROM public.finance_intercompany_settlements s WHERE s.transfer_id=t.id),'[]')) ORDER BY t.as_of,t.id),'[]') INTO v_rows FROM public.finance_intercompany t WHERE t.org_id=v_org AND p_entity IN (t.entity_id,t.counterparty_id);
 WITH expected AS (
  SELECT CASE WHEN entity_id=p_entity THEN (terms->>'due_from_account_id')::uuid ELSE (terms->>'due_to_account_id')::uuid END AS account,
   sum((CASE WHEN entity_id=p_entity THEN 1 ELSE -1 END)*CASE WHEN as_of>p_as_of OR reversal_date<=p_as_of THEN 0 ELSE amount-public.intercompany_settled(id,p_as_of) END) AS amount
  FROM public.finance_intercompany WHERE org_id=v_org AND p_entity IN (entity_id,counterparty_id) GROUP BY account
 ), balances AS (SELECT e.*,coalesce((SELECT sum(l.debit-l.credit) FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.entity_id=p_entity AND j.org_id=v_org AND j.status='posted' AND j.entry_date<=p_as_of AND l.account_id=e.account),0) AS ledger FROM expected e)
 SELECT coalesce(jsonb_agg(jsonb_build_object('accountId',account,'expected',round(amount,2)::text,'ledger',round(ledger,2)::text,'variance',round(ledger-amount,2)::text) ORDER BY account),'[]') INTO v_controls FROM balances;
 v_result:=jsonb_build_object('entityId',p_entity,'asOf',p_as_of,'currency',v_trial->>'currency','transfers',v_rows,'controls',v_controls);
 RETURN v_result||jsonb_build_object('revision',md5(v_result::text),'generatedAt',statement_timestamp());
END; $$;

CREATE OR REPLACE FUNCTION public.get_finance_close_check(p_entity uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;v_controls jsonb;
BEGIN
 v_result:=public.get_pre_intercompany_close_check(p_entity,p_from,p_through)-'generatedAt'-'revision';
 v_controls:=public.get_intercompany_report(p_entity,p_through)->'controls';
 v_result:=v_result||jsonb_build_object('intercompanyControls',v_controls,'canClose',(v_result->>'canClose')::boolean AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_controls) c WHERE (c->>'variance')::numeric<>0));
 RETURN v_result||jsonb_build_object('revision',md5(v_result::text),'generatedAt',statement_timestamp());
END; $$;

DO $$ DECLARE t text;f record;
BEGIN
 FOREACH t IN ARRAY ARRAY['finance_intercompany','finance_intercompany_settlements'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(org_id=public.get_user_org_id())',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
 END LOOP;
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('finance_pair_lines','intercompany_settled','intercompany_control_account','require_intercompany_cash','validate_finance_extension','execute_finance_extension','finance_source_snapshot','intercompany_request_counterparty','guard_finance_approval_posting','guard_intercompany_reversal','validate_intercompany_graph','check_intercompany_graph_trigger','get_intercompany_report','validate_close_extension','execute_close_extension','close_source_snapshot','get_finance_close_check','get_pre_intercompany_close_check') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);IF f.proname IN ('get_intercompany_report','get_finance_close_check') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
