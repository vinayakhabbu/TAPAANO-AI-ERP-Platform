BEGIN;
ALTER TABLE public.finance_provider_refunds
 ADD COLUMN IF NOT EXISTS payment_method text NOT NULL DEFAULT 'CARD',
 ADD COLUMN IF NOT EXISTS fee_account_id uuid,
 ADD COLUMN IF NOT EXISTS maximum_fee numeric(15,2) NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS return_fee_journal uuid;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='provider_refund_fee_policy') THEN
  ALTER TABLE public.finance_provider_refunds ADD CONSTRAINT provider_refund_fee_policy CHECK(payment_method IN ('CARD','US_BANK_ACCOUNT') AND maximum_fee>=0 AND maximum_fee::text NOT IN ('NaN','Infinity','-Infinity') AND (maximum_fee=0 OR fee_account_id IS NOT NULL));
  ALTER TABLE public.finance_provider_refunds ADD CONSTRAINT provider_refund_fee_account FOREIGN KEY(org_id,fee_account_id) REFERENCES public.accounts(org_id,id);
  ALTER TABLE public.finance_provider_refunds ADD CONSTRAINT provider_refund_return_fee FOREIGN KEY(return_fee_journal) REFERENCES public.journal_entries(id);
  ALTER TABLE public.finance_provider_refunds ADD CONSTRAINT provider_refund_return_fee_unique UNIQUE(return_fee_journal);
 END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.refund_balance_fee(p_balance jsonb)
RETURNS numeric LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$ SELECT coalesce((p_balance->>'fee')::numeric,0) $$;
CREATE OR REPLACE FUNCTION public.refund_balance_normalized(p_balance jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN p_balance IS NULL OR p_balance='null'::jsonb THEN 'null'::jsonb ELSE p_balance||jsonb_build_object('fee',public.refund_balance_fee(p_balance)::numeric(38,2)::text,'net',coalesce(p_balance->>'net',p_balance->>'amount')) END
$$;
CREATE OR REPLACE FUNCTION public.provider_refund_journal_lines(p_job uuid,p_proof jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.finance_provider_refunds%ROWTYPE;liability uuid;fee numeric;lines jsonb;
BEGIN
 SELECT * INTO j FROM public.finance_provider_refunds WHERE id=p_job;SELECT p.liability_account_id INTO liability FROM public.finance_customer_credits c JOIN public.finance_customer_credit_controls p ON p.id=c.control_id WHERE c.id=j.credit_id;
 fee:=public.refund_balance_fee(p_proof->'balance');
 IF fee<0 OR fee>j.maximum_fee OR (fee>0 AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=j.fee_account_id AND org_id=j.org_id AND account_type='expense')) THEN RAISE EXCEPTION 'provider refund fee exceeds its approved accounting policy';END IF;
 IF fee=0 THEN RETURN public.finance_pair_lines(liability,j.clearing_account_id,j.amount);END IF;
 lines:=jsonb_build_array(jsonb_build_object('account_id',liability,'debit',j.amount::text,'credit','0.00'),jsonb_build_object('account_id',j.fee_account_id,'debit',round(fee,2)::text,'credit','0.00'),jsonb_build_object('account_id',j.clearing_account_id,'debit','0.00','credit',round(j.amount+fee,2)::text));
 RETURN lines;
END; $$;
CREATE OR REPLACE FUNCTION public.validate_provider_refund_fee_return(p_job uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.finance_provider_refunds%ROWTYPE;u public.finance_customer_credit_uses%ROWTYPE;r public.finance_requests%ROWTYPE;proof jsonb;retained numeric;
BEGIN
 SELECT * INTO j FROM public.finance_provider_refunds WHERE id=p_job;SELECT * INTO u FROM public.finance_customer_credit_uses WHERE id=j.use_id;
 IF u.reversal_date IS NULL THEN IF j.return_fee_journal IS NOT NULL THEN RAISE EXCEPTION 'provider return fee is detached from a reviewed refund correction';END IF;RETURN;END IF;
 SELECT * INTO r FROM public.finance_requests WHERE id=u.reversal_request;
 SELECT a->'proof' INTO proof FROM jsonb_array_elements(r.source_snapshot->'providerRefunds') a WHERE a->'job'->>'id'=j.id::text;
 retained:=public.refund_balance_fee(proof->'balance')+public.refund_balance_fee(proof->'failureBalance');
 IF retained<0 OR retained>j.maximum_fee THEN RAISE EXCEPTION 'returned refund fee exceeds approved bounds';END IF;
 IF retained>0 THEN
  PERFORM public.assert_finance_journal(j.return_fee_journal,j.org_id,j.entity_id,u.reversal_date,public.finance_pair_lines(j.fee_account_id,j.clearing_account_id,retained));
  IF NOT EXISTS(SELECT 1 FROM public.journal_entries je JOIN public.accounting_events ev ON ev.id=je.accounting_event_id WHERE je.id=j.return_fee_journal AND ev.idempotency_key='finance:'||r.id||':retained-refund-fee' AND je.created_by=r.decided_by) THEN RAISE EXCEPTION 'returned refund fee journal approval is invalid';END IF;
 ELSIF j.return_fee_journal IS NOT NULL THEN RAISE EXCEPTION 'zero retained refund fee cannot own a journal';END IF;
END; $$;

-- Extend the captured provider layer while retaining the outer tax workflow.
CREATE OR REPLACE FUNCTION public.pre_tax_validate(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_c public.finance_customer_credits%ROWTYPE;v_i public.finance_inbox%ROWTYPE;v_conn public.finance_connections%ROWTYPE;
 v_receipt public.customer_receipts%ROWTYPE;v_job public.finance_provider_refunds%ROWTYPE;v_use public.finance_customer_credit_uses%ROWTYPE;v_amount numeric;v_result jsonb;v_proof jsonb;v_date date;
BEGIN
 IF p_kind='PROVIDER_REFUND' THEN
  IF p_payload-ARRAY['id','credit_id','event_id','amount','reference','date','payment_method','fee_account_id','maximum_fee','customer_notice']<>'{}'::jsonb OR coalesce(p_payload->>'id','') !~ '^[a-f0-9-]{36}$' OR
   jsonb_typeof(p_payload->'amount') IS DISTINCT FROM 'string' OR length(coalesce(p_payload->>'reference','')) NOT BETWEEN 1 AND 160 OR
   p_payload->>'reference'<>btrim(p_payload->>'reference') OR p_payload->>'reference' ~ '[[:cntrl:]]' OR coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'exact provider refund amount, date and reference required';END IF;
  v_date:=(p_payload->>'date')::date;v_amount:=public.cash_amount(p_payload->>'amount');
  SELECT * INTO v_c FROM public.finance_customer_credits WHERE id=(p_payload->>'credit_id')::uuid AND entity_id=p_entity AND org_id=v_org AND reversal_date IS NULL;
  SELECT * INTO v_i FROM public.finance_inbox WHERE id=(p_payload->>'event_id')::uuid AND org_id=v_org AND operation='RECEIPT' AND state='APPLIED';
  SELECT * INTO v_conn FROM public.finance_connections WHERE id=v_i.connection_id AND entity_id=p_entity AND org_id=v_org AND enabled AND provider='STRIPE' AND currency='USD';
  SELECT * INTO v_receipt FROM public.customer_receipts WHERE id=(v_i.result->>'receiptId')::uuid AND org_id=v_org AND entity_id=p_entity;
  IF v_c.id IS NULL OR v_conn.id IS NULL OR v_receipt.id IS NULL OR v_receipt.invoice_id<>v_c.invoice_id OR v_i.object_id !~ '^in_[A-Za-z0-9]{1,180}$' OR
   v_date<greatest(v_c.as_of,v_receipt.receipt_date) OR v_date>CURRENT_DATE OR EXISTS(SELECT 1 FROM public.customer_receipt_corrections WHERE original_receipt_id=v_receipt.id) THEN RAISE EXCEPTION 'active credited invoice and reviewed Stripe receipt required';END IF;
  PERFORM public.validate_customer_credit_graph(v_c.id);PERFORM public.validate_integration_graph(v_i.id);
  IF EXISTS(SELECT 1 FROM public.finance_provider_refunds WHERE provider_account=v_conn.provider_account AND environment=v_conn.environment AND connection_id<>v_conn.id) THEN RAISE EXCEPTION 'Stripe refund account is already assigned to another connection';END IF;
  IF EXISTS(SELECT 1 FROM public.finance_provider_refunds WHERE id=(p_payload->>'id')::uuid) THEN RAISE EXCEPTION 'provider refund reference already used';END IF;
  IF v_amount<=0 OR v_amount>public.customer_credit_remaining(v_c.id,CURRENT_DATE)-public.provider_refund_reserved(v_c.id) OR
   v_amount+public.provider_refund_reserved(NULL,v_receipt.id)+coalesce((SELECT sum(amount) FROM public.finance_customer_credit_uses WHERE settlement_id=v_receipt.id AND reversal_date IS NULL),0)>v_receipt.amount THEN RAISE EXCEPTION 'refund exceeds unreserved customer credit or original receipt';END IF;
  IF coalesce(p_payload->>'payment_method','CARD') NOT IN ('CARD','US_BANK_ACCOUNT') OR public.cash_amount(coalesce(p_payload->>'maximum_fee','0.00'))<0 OR
    (p_payload?'maximum_fee' AND jsonb_typeof(p_payload->'maximum_fee') IS DISTINCT FROM 'string') OR
    (p_payload?'fee_account_id' AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(p_payload->>'fee_account_id')::uuid AND org_id=v_org AND account_type='expense' AND is_active)) OR
    (public.cash_amount(coalesce(p_payload->>'maximum_fee','0.00'))>0 AND NOT p_payload?'fee_account_id') THEN RAISE EXCEPTION 'refund method and approved fee expense limit are invalid';END IF;
  IF p_payload->>'payment_method'='US_BANK_ACCOUNT' AND (v_amount<>v_receipt.amount OR length(btrim(coalesce(p_payload->>'customer_notice',''))) NOT BETWEEN 1 AND 1000) THEN RAISE EXCEPTION 'ACH refund requires the full original receipt and customer notification evidence';END IF;
  RETURN p_payload;
 ELSIF p_kind IN ('PROVIDER_REFUND_CANCEL','PROVIDER_REFUND_POST') THEN
  IF p_payload-(CASE WHEN p_kind='PROVIDER_REFUND_POST' THEN ARRAY['job_id','date'] ELSE ARRAY['job_id'] END)<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid provider refund action fields';END IF;
  SELECT * INTO v_job FROM public.finance_provider_refunds WHERE id=(p_payload->>'job_id')::uuid AND org_id=v_org AND entity_id=p_entity;
  IF v_job.id IS NULL OR v_job.cancel_request IS NOT NULL THEN RAISE EXCEPTION 'active provider refund unavailable';END IF;
  PERFORM public.validate_provider_refund_graph(v_job.id);
  IF p_kind='PROVIDER_REFUND_CANCEL' THEN
   IF v_job.dispatch_started_at IS NOT NULL THEN RAISE EXCEPTION 'refund dispatch may have reached Stripe; recover its provider status before any financial change';END IF;
  ELSE
   v_proof:=public.provider_refund_proof(v_job.id);
   IF v_job.use_id IS NOT NULL OR v_proof->>'status' IS DISTINCT FROM 'succeeded' OR v_proof->'balance'='null'::jsonb OR v_job.last_error IS NOT NULL OR v_job.last_checked_at<now()-INTERVAL '24 hours' THEN RAISE EXCEPTION 'fresh successful provider refund and balance evidence required';END IF;
   IF coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (p_payload->>'date')::date IS DISTINCT FROM public.provider_refund_date(v_job.id) OR (p_payload->>'date')::date>CURRENT_DATE THEN RAISE EXCEPTION 'post on the verified provider balance date';END IF;
   SELECT * INTO v_c FROM public.finance_customer_credits WHERE id=v_job.credit_id;
   IF (p_payload->>'date')::date<v_c.as_of THEN RAISE EXCEPTION 'refund accounting date precedes customer credit history';END IF;
  END IF;RETURN p_payload;
 END IF;
 IF p_kind IN ('CUSTOMER_REFUND','CUSTOMER_CREDIT_APPLY','CUSTOMER_CREDIT_REVERSE') THEN
  SELECT * INTO v_c FROM public.finance_customer_credits WHERE id=(p_payload->>'credit_id')::uuid AND org_id=v_org AND entity_id=p_entity;
  IF p_kind='CUSTOMER_CREDIT_REVERSE' AND public.provider_refund_reserved(v_c.id)>0 THEN RAISE EXCEPTION 'resolve reserved provider refunds before reversing the credit';END IF;
  IF p_kind<>'CUSTOMER_CREDIT_REVERSE' AND public.provider_refund_reserved(v_c.id)>0 AND public.cash_amount(p_payload->>'amount')>public.customer_credit_remaining(v_c.id,(p_payload->>'date')::date)-public.provider_refund_reserved(v_c.id) THEN RAISE EXCEPTION 'customer credit is reserved for a provider refund';END IF;
  IF p_kind='CUSTOMER_REFUND' THEN
   SELECT * INTO v_receipt FROM public.customer_receipts WHERE id=(p_payload->>'settlement_id')::uuid AND org_id=v_org;
   IF v_receipt.id IS NOT NULL AND public.cash_amount(p_payload->>'amount')+public.provider_refund_reserved(NULL,v_receipt.id)+coalesce((SELECT sum(amount) FROM public.finance_customer_credit_uses WHERE settlement_id=v_receipt.id AND reversal_date IS NULL),0)>v_receipt.amount THEN RAISE EXCEPTION 'original receipt is reserved for a provider refund';END IF;
  END IF;
 ELSIF p_kind='CUSTOMER_CREDIT_USE_REVERSE' THEN
  SELECT * INTO v_job FROM public.finance_provider_refunds WHERE use_id=(p_payload->>'use_id')::uuid AND org_id=v_org AND entity_id=p_entity;
  IF v_job.id IS NOT NULL THEN
   v_proof:=public.provider_refund_proof(v_job.id);
   IF v_proof->>'status' NOT IN ('failed','canceled') OR v_proof->'failureBalance'='null'::jsonb OR v_job.last_error IS NOT NULL OR v_job.last_checked_at<now()-INTERVAL '24 hours' OR
    (p_payload->>'date')::date IS DISTINCT FROM public.provider_refund_date(v_job.id,true) THEN RAISE EXCEPTION 'verified returned provider funds and their accounting date are required for refund correction';END IF;
  END IF;
 END IF;
 v_result:=public.pre_provider_refund_validate(p_entity,p_kind,p_payload);RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.pre_tax_execute(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p jsonb:=p_request.payload;v_c public.finance_connections%ROWTYPE;v_i public.finance_inbox%ROWTYPE;v_credit public.finance_customer_credits%ROWTYPE;v_job public.finance_provider_refunds%ROWTYPE;v_id uuid;v_journal uuid;v_liability uuid;v_result jsonb;v_proof jsonb;v_fee numeric;
BEGIN
 IF p_request.kind='PROVIDER_REFUND' THEN
  SELECT * INTO v_i FROM public.finance_inbox WHERE id=(v_p->>'event_id')::uuid;SELECT * INTO v_c FROM public.finance_connections WHERE id=v_i.connection_id;
  SELECT * INTO v_credit FROM public.finance_customer_credits WHERE id=(v_p->>'credit_id')::uuid;
  INSERT INTO public.finance_provider_refunds(id,org_id,entity_id,connection_id,inbox_id,credit_id,receipt_id,invoice_id,amount,reference,as_of,provider_account,environment,connection_version,clearing_account_id,timezone,request_id,payment_method,fee_account_id,maximum_fee)
   VALUES((v_p->>'id')::uuid,p_request.org_id,p_request.entity_id,v_c.id,v_i.id,v_credit.id,(v_i.result->>'receiptId')::uuid,v_credit.invoice_id,public.cash_amount(v_p->>'amount'),v_p->>'reference',(v_p->>'date')::date,v_c.provider_account,v_c.environment,v_c.version,v_c.clearing_account_id,v_c.timezone,p_request.id,coalesce(v_p->>'payment_method','CARD'),(v_p->>'fee_account_id')::uuid,public.cash_amount(coalesce(v_p->>'maximum_fee','0.00'))) RETURNING id INTO v_id;
  RETURN jsonb_build_object('refundJobId',v_id);
 ELSIF p_request.kind='PROVIDER_REFUND_CANCEL' THEN
  UPDATE public.finance_provider_refunds SET cancel_request=p_request.id,lease_token=NULL,lease_until=NULL WHERE id=(v_p->>'job_id')::uuid;RETURN jsonb_build_object('canceled',v_p->>'job_id');
 ELSIF p_request.kind='PROVIDER_REFUND_POST' THEN
  SELECT * INTO v_job FROM public.finance_provider_refunds WHERE id=(v_p->>'job_id')::uuid;SELECT * INTO v_credit FROM public.finance_customer_credits WHERE id=v_job.credit_id;
  SELECT liability_account_id INTO v_liability FROM public.finance_customer_credit_controls WHERE id=v_credit.control_id;
  v_journal:=public.post_manual_journal(p_request.entity_id,'PROVIDER-REFUND-'||v_job.id,(v_p->>'date')::date,'Verified Stripe refund '||v_job.provider_id,public.provider_refund_journal_lines(v_job.id,p_request.source_snapshot->'proof'),'finance:'||p_request.id||':provider-refund');
  INSERT INTO public.finance_customer_credit_uses(org_id,entity_id,credit_id,kind,as_of,amount,cash_account_id,settlement_id,settlement_kind,reference,journal_id,request_id)
   VALUES(p_request.org_id,p_request.entity_id,v_credit.id,'REFUND',(v_p->>'date')::date,v_job.amount,v_job.clearing_account_id,v_job.receipt_id,'RECEIPT',v_job.provider_id,v_journal,p_request.id) RETURNING id INTO v_id;
  UPDATE public.finance_provider_refunds SET use_id=v_id WHERE id=v_job.id;RETURN jsonb_build_object('refundJobId',v_job.id,'useId',v_id,'journalId',v_journal);
 END IF;
 IF p_request.kind='CUSTOMER_CREDIT_USE_REVERSE' THEN
  SELECT * INTO v_job FROM public.finance_provider_refunds WHERE use_id=(v_p->>'use_id')::uuid;
  IF v_job.id IS NOT NULL THEN
   v_result:=public.pre_provider_refund_execute(p_request);v_proof:=public.provider_refund_proof(v_job.id);
   v_fee:=public.refund_balance_fee(v_proof->'balance')+public.refund_balance_fee(v_proof->'failureBalance');
   IF v_fee>0 THEN
    v_journal:=public.post_manual_journal(p_request.entity_id,'REFUND-RETURN-FEE-'||v_job.id,(v_p->>'date')::date,'Provider fees retained after returned refund',public.finance_pair_lines(v_job.fee_account_id,v_job.clearing_account_id,v_fee),'finance:'||p_request.id||':retained-refund-fee');
    UPDATE public.finance_provider_refunds SET return_fee_journal=v_journal WHERE id=v_job.id;
   END IF;RETURN v_result;
  END IF;
 END IF;RETURN public.pre_provider_refund_execute(p_request);
END; $$;

CREATE OR REPLACE FUNCTION public.validate_provider_refund_evidence(p_job public.finance_provider_refunds,p_proof jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_balance jsonb;v_failure boolean;v_expected numeric;v_digest text;
BEGIN
 SELECT md5(payload::text) INTO v_digest FROM public.finance_requests WHERE id=p_job.request_id;
 IF jsonb_typeof(p_proof) IS DISTINCT FROM 'object' OR p_proof-ARRAY['id','chargeId','paymentIntentId','amount','currency','status','created','jobId','approvalDigest','balance','failureBalance']<>'{}'::jsonb OR
  coalesce(p_proof->>'id','') !~ '^re_[A-Za-z0-9]{1,180}$' OR p_proof->>'chargeId' IS DISTINCT FROM p_job.preflight->>'chargeId' OR p_proof->>'paymentIntentId' IS DISTINCT FROM p_job.preflight->>'paymentIntentId' OR
  p_proof->>'jobId' IS DISTINCT FROM p_job.id::text OR p_proof->>'approvalDigest' IS DISTINCT FROM v_digest OR p_proof->>'currency' IS DISTINCT FROM 'USD' OR
  jsonb_typeof(p_proof->'amount') IS DISTINCT FROM 'string' OR public.cash_amount(p_proof->>'amount') IS DISTINCT FROM p_job.amount OR
  coalesce(p_proof->>'status','') NOT IN ('pending','requires_action','succeeded','failed','canceled') OR coalesce(p_proof->>'created','') !~ '^[0-9]{1,11}$' OR
  to_timestamp((p_proof->>'created')::bigint)<p_job.dispatch_started_at-INTERVAL '5 minutes' OR to_timestamp((p_proof->>'created')::bigint)>now()+INTERVAL '5 minutes' THEN RAISE EXCEPTION 'provider refund evidence does not match the approved dispatch';END IF;
 FOR v_failure IN SELECT false UNION ALL SELECT true LOOP
  v_balance:=p_proof->(CASE WHEN v_failure THEN 'failureBalance' ELSE 'balance' END);v_expected:=CASE WHEN v_failure THEN p_job.amount ELSE -p_job.amount END;
  IF v_balance IS NULL THEN RAISE EXCEPTION 'provider balance evidence field missing';END IF;
  IF v_balance<>'null'::jsonb AND (jsonb_typeof(v_balance) IS DISTINCT FROM 'object' OR v_balance-ARRAY['id','source','amount','currency','type','created','fee','net']<>'{}'::jsonb OR
   coalesce(v_balance->>'id','') !~ '^txn_[A-Za-z0-9]{1,180}$' OR v_balance->>'source' IS DISTINCT FROM p_proof->>'id' OR v_balance->>'currency' IS DISTINCT FROM 'USD' OR
   jsonb_typeof(v_balance->'amount') IS DISTINCT FROM 'string' OR public.cash_amount(v_balance->>'amount') IS DISTINCT FROM v_expected OR
   coalesce(v_balance->>'type','') NOT IN ('refund','refund_failure','payment_refund','payment_failure_refund') OR coalesce(v_balance->>'created','') !~ '^[0-9]{1,11}$' OR
   (v_balance->>'created')::bigint<(p_proof->>'created')::bigint OR to_timestamp((v_balance->>'created')::bigint)>now()+INTERVAL '5 minutes') THEN RAISE EXCEPTION 'provider refund balance impact is invalid';END IF;
  IF v_balance<>'null'::jsonb THEN
   IF (v_balance?'fee')<>(v_balance?'net') OR (v_balance?'fee' AND (jsonb_typeof(v_balance->'fee') IS DISTINCT FROM 'string' OR jsonb_typeof(v_balance->'net') IS DISTINCT FROM 'string' OR public.cash_amount(v_balance->>'net') IS DISTINCT FROM public.cash_amount(v_balance->>'amount')-public.cash_amount(v_balance->>'fee'))) OR
    (NOT v_failure AND (public.refund_balance_fee(v_balance)<0 OR public.refund_balance_fee(v_balance)>p_job.maximum_fee)) OR
    (v_failure AND (public.refund_balance_fee(p_proof->'balance')+public.refund_balance_fee(v_balance)<0 OR public.refund_balance_fee(p_proof->'balance')+public.refund_balance_fee(v_balance)>p_job.maximum_fee)) THEN RAISE EXCEPTION 'provider refund fee and net balance do not reconcile to approved limits';END IF;
   IF EXISTS(SELECT 1 FROM public.finance_provider_refund_observations o WHERE o.refund_id=p_job.id AND o.proof->(CASE WHEN v_failure THEN 'failureBalance' ELSE 'balance' END)<>'null'::jsonb AND public.refund_balance_normalized(o.proof->(CASE WHEN v_failure THEN 'failureBalance' ELSE 'balance' END)) IS DISTINCT FROM public.refund_balance_normalized(v_balance)) THEN RAISE EXCEPTION 'verified provider balance evidence cannot change';END IF;
  END IF;
 END LOOP;
 IF p_proof->>'status'='succeeded' AND (p_proof->'balance'='null'::jsonb OR p_proof->'failureBalance'<>'null'::jsonb) THEN RAISE EXCEPTION 'successful provider refund requires its original balance impact';END IF;
 IF p_proof->>'status' IN ('failed','canceled') AND p_proof->'balance'<>'null'::jsonb AND p_proof->'failureBalance'='null'::jsonb THEN RAISE EXCEPTION 'returned provider funds require reversal balance evidence';END IF;
 IF p_proof->'failureBalance'<>'null'::jsonb AND (p_proof->>'status' NOT IN ('failed','canceled') OR p_proof->'balance'='null'::jsonb OR (p_proof->'failureBalance'->>'created')::bigint<(p_proof->'balance'->>'created')::bigint) THEN RAISE EXCEPTION 'invalid provider failure balance sequence';END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_provider_refund_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_j public.finance_provider_refunds%ROWTYPE;v_r public.finance_requests%ROWTYPE;v_i public.finance_inbox%ROWTYPE;v_c public.finance_connections%ROWTYPE;
 v_credit public.finance_customer_credits%ROWTYPE;v_receipt public.customer_receipts%ROWTYPE;v_u public.finance_customer_credit_uses%ROWTYPE;v_o record;v_latest public.finance_provider_refund_observations%ROWTYPE;v_lines jsonb;v_liability uuid;
BEGIN
 SELECT * INTO v_j FROM public.finance_provider_refunds WHERE id=p_id;IF v_j.id IS NULL THEN RAISE EXCEPTION 'provider refund graph missing';END IF;
 SELECT * INTO v_r FROM public.finance_requests WHERE id=v_j.request_id;SELECT * INTO v_i FROM public.finance_inbox WHERE id=v_j.inbox_id;
 SELECT * INTO v_c FROM public.finance_connections WHERE id=v_j.connection_id;SELECT * INTO v_credit FROM public.finance_customer_credits WHERE id=v_j.credit_id;SELECT * INTO v_receipt FROM public.customer_receipts WHERE id=v_j.receipt_id;
 IF v_r.org_id IS DISTINCT FROM v_j.org_id OR v_r.entity_id IS DISTINCT FROM v_j.entity_id OR v_r.kind IS DISTINCT FROM 'PROVIDER_REFUND' OR v_r.state NOT IN ('APPROVED','EXECUTING') OR v_r.requested_by=v_r.decided_by OR
  (v_r.payload-ARRAY['payment_method','fee_account_id','maximum_fee','customer_notice']) IS DISTINCT FROM jsonb_build_object('id',v_j.id,'credit_id',v_j.credit_id,'event_id',v_j.inbox_id,'amount',v_r.payload->>'amount','reference',v_j.reference,'date',v_j.as_of) OR public.cash_amount(v_r.payload->>'amount') IS DISTINCT FROM v_j.amount OR
  v_c.org_id IS DISTINCT FROM v_j.org_id OR v_c.entity_id IS DISTINCT FROM v_j.entity_id OR v_c.provider<>'STRIPE' OR v_c.currency<>'USD' OR v_c.provider_account<>v_j.provider_account OR v_c.environment<>v_j.environment OR v_c.clearing_account_id<>v_j.clearing_account_id OR v_c.timezone<>v_j.timezone OR
  v_r.source_snapshot->'integration'->>'connection_version' IS DISTINCT FROM v_j.connection_version::text OR
  v_i.org_id IS DISTINCT FROM v_j.org_id OR v_i.connection_id IS DISTINCT FROM v_j.connection_id OR v_i.operation<>'RECEIPT' OR v_i.result->>'receiptId' IS DISTINCT FROM v_j.receipt_id::text OR
  v_credit.org_id IS DISTINCT FROM v_j.org_id OR v_credit.entity_id IS DISTINCT FROM v_j.entity_id OR v_credit.invoice_id IS DISTINCT FROM v_j.invoice_id OR
  v_receipt.org_id IS DISTINCT FROM v_j.org_id OR v_receipt.entity_id IS DISTINCT FROM v_j.entity_id OR v_receipt.invoice_id IS DISTINCT FROM v_j.invoice_id OR v_j.as_of<greatest(v_credit.as_of,v_receipt.receipt_date) THEN RAISE EXCEPTION 'provider refund approval or original payment graph is invalid';END IF;
 IF v_j.payment_method IS DISTINCT FROM coalesce(v_r.payload->>'payment_method','CARD') OR v_j.fee_account_id IS DISTINCT FROM (v_r.payload->>'fee_account_id')::uuid OR v_j.maximum_fee IS DISTINCT FROM public.cash_amount(coalesce(v_r.payload->>'maximum_fee','0.00')) OR
  (v_j.maximum_fee>0 AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=v_j.fee_account_id AND org_id=v_j.org_id AND account_type='expense')) OR
  (v_j.payment_method='US_BANK_ACCOUNT' AND (v_j.amount<>v_receipt.amount OR length(btrim(coalesce(v_r.payload->>'customer_notice',''))) NOT BETWEEN 1 AND 1000)) THEN RAISE EXCEPTION 'provider refund method and fee approval graph is invalid';END IF;
 PERFORM public.validate_customer_credit_graph(v_credit.id);PERFORM public.validate_integration_graph(v_i.id);
 IF EXISTS(SELECT 1 FROM public.finance_provider_refunds WHERE provider_account=v_j.provider_account AND environment=v_j.environment AND connection_id<>v_j.connection_id) THEN RAISE EXCEPTION 'provider refund account has conflicting tenant ownership';END IF;
 IF v_j.cancel_request IS NOT NULL AND (v_j.dispatch_started_at IS NOT NULL OR v_j.provider_id IS NOT NULL OR v_j.use_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_j.cancel_request AND org_id=v_j.org_id AND entity_id=v_j.entity_id AND kind='PROVIDER_REFUND_CANCEL' AND payload=jsonb_build_object('job_id',v_j.id) AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by)) THEN RAISE EXCEPTION 'provider refund cancellation graph is invalid';END IF;
 IF v_j.preflight IS NOT NULL THEN
  IF jsonb_typeof(v_j.preflight) IS DISTINCT FROM 'object' OR v_j.preflight-ARRAY['invoiceId','paymentId','paymentIntentId','chargeId','receiptAmount','currency','accountId','environment','paymentMethod','chargeCreated']<>'{}'::jsonb OR
   v_j.preflight->>'invoiceId' IS DISTINCT FROM v_i.object_id OR v_j.preflight->>'accountId' IS DISTINCT FROM v_j.provider_account OR v_j.preflight->>'environment' IS DISTINCT FROM v_j.environment OR v_j.preflight->>'currency' IS DISTINCT FROM 'USD' OR
   coalesce(v_j.preflight->>'paymentId','') !~ '^inpay_[A-Za-z0-9]{1,180}$' OR coalesce(v_j.preflight->>'paymentIntentId','') !~ '^pi_[A-Za-z0-9]{1,180}$' OR coalesce(v_j.preflight->>'chargeId','') !~ '^ch_[A-Za-z0-9]{1,180}$' OR
   jsonb_typeof(v_j.preflight->'receiptAmount') IS DISTINCT FROM 'string' OR public.cash_amount(v_j.preflight->>'receiptAmount') IS DISTINCT FROM v_receipt.amount THEN RAISE EXCEPTION 'provider refund verified payment binding is invalid';END IF;
  IF coalesce(v_j.preflight->>'paymentMethod','CARD') IS DISTINCT FROM v_j.payment_method OR (v_j.payment_method='US_BANK_ACCOUNT' AND (coalesce(v_j.preflight->>'chargeCreated','') !~ '^[0-9]{1,11}$' OR to_timestamp((v_j.preflight->>'chargeCreated')::bigint)>v_j.dispatch_started_at OR v_j.dispatch_started_at>=to_timestamp((v_j.preflight->>'chargeCreated')::bigint)+INTERVAL '180 days')) THEN RAISE EXCEPTION 'ACH refund method or original payment age is invalid';END IF;
 END IF;
 FOR v_o IN SELECT * FROM public.finance_provider_refund_observations WHERE refund_id=v_j.id ORDER BY observed_at,id LOOP
  IF v_o.org_id<>v_j.org_id OR v_j.preflight IS NULL OR v_o.proof->>'id' IS DISTINCT FROM v_j.provider_id OR v_o.observed_at<v_j.dispatch_started_at OR v_o.body_sha256 !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'provider refund observation graph is invalid';END IF;
  PERFORM public.validate_provider_refund_evidence(v_j,v_o.proof);
 END LOOP;
 SELECT * INTO v_latest FROM public.finance_provider_refund_observations WHERE refund_id=v_j.id ORDER BY observed_at DESC,id DESC LIMIT 1;
 IF (v_latest.id IS NULL)<>(v_j.provider_id IS NULL) OR v_latest.observed_at IS DISTINCT FROM v_j.last_checked_at THEN RAISE EXCEPTION 'provider refund latest evidence pointer is invalid';END IF;
 IF v_j.use_id IS NOT NULL THEN
  SELECT * INTO v_u FROM public.finance_customer_credit_uses WHERE id=v_j.use_id;SELECT * INTO v_r FROM public.finance_requests WHERE id=v_u.request_id;
  IF v_u.org_id IS DISTINCT FROM v_j.org_id OR v_u.entity_id IS DISTINCT FROM v_j.entity_id OR v_u.credit_id IS DISTINCT FROM v_j.credit_id OR v_u.kind<>'REFUND' OR v_u.amount<>v_j.amount OR v_u.invoice_id IS NOT NULL OR v_u.cash_account_id<>v_j.clearing_account_id OR v_u.settlement_id<>v_j.receipt_id OR v_u.settlement_kind<>'RECEIPT' OR v_u.reference<>v_j.provider_id OR
   v_r.kind IS DISTINCT FROM 'PROVIDER_REFUND_POST' OR v_r.org_id IS DISTINCT FROM v_j.org_id OR v_r.entity_id IS DISTINCT FROM v_j.entity_id OR v_r.state NOT IN ('APPROVED','EXECUTING') OR v_r.requested_by=v_r.decided_by OR (v_r.payload-ARRAY['payment_method','fee_account_id','maximum_fee','customer_notice']) IS DISTINCT FROM jsonb_build_object('job_id',v_j.id,'date',v_u.as_of) OR
   v_r.source_snapshot->'proof'->>'status' IS DISTINCT FROM 'succeeded' OR (to_timestamp((v_r.source_snapshot->'proof'->'balance'->>'created')::bigint) AT TIME ZONE v_j.timezone)::date IS DISTINCT FROM v_u.as_of OR
   NOT EXISTS(SELECT 1 FROM public.finance_provider_refund_observations WHERE refund_id=v_j.id AND proof=v_r.source_snapshot->'proof') THEN RAISE EXCEPTION 'provider refund posting approval graph is invalid';END IF;
  SELECT liability_account_id INTO v_liability FROM public.finance_customer_credit_controls WHERE id=v_credit.control_id;v_lines:=public.provider_refund_journal_lines(v_j.id,v_r.source_snapshot->'proof');
  PERFORM public.assert_finance_journal(v_u.journal_id,v_j.org_id,v_j.entity_id,v_u.as_of,v_lines,v_u.reversal_journal);
  IF v_u.reversal_date IS NOT NULL THEN
   SELECT * INTO v_r FROM public.finance_requests WHERE id=v_u.reversal_request;
   IF v_r.kind IS DISTINCT FROM 'CUSTOMER_CREDIT_USE_REVERSE' OR v_r.org_id IS DISTINCT FROM v_j.org_id OR v_r.entity_id IS DISTINCT FROM v_j.entity_id OR v_r.state NOT IN ('APPROVED','EXECUTING') OR v_r.requested_by=v_r.decided_by OR (v_r.payload-ARRAY['payment_method','fee_account_id','maximum_fee','customer_notice']) IS DISTINCT FROM jsonb_build_object('use_id',v_u.id,'date',v_u.reversal_date) OR v_u.reversal_date<v_u.as_of OR NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_r.source_snapshot->'providerRefunds') s JOIN public.finance_provider_refund_observations o ON o.refund_id=v_j.id AND o.proof=s->'proof'
    WHERE s->'job'->>'id'=v_j.id::text AND s->'proof'->>'status' IN ('failed','canceled') AND (to_timestamp((s->'proof'->'failureBalance'->>'created')::bigint) AT TIME ZONE v_j.timezone)::date=v_u.reversal_date
   ) THEN RAISE EXCEPTION 'provider refund return correction graph is invalid';END IF;
   PERFORM public.assert_finance_journal(v_u.reversal_journal,v_j.org_id,v_j.entity_id,v_u.reversal_date,public.flip_finance_lines(v_lines),NULL,v_u.journal_id);
  ELSIF v_u.reversal_journal IS NOT NULL OR v_u.reversal_request IS NOT NULL THEN RAISE EXCEPTION 'incomplete provider refund return correction';END IF;
 END IF;
 PERFORM public.validate_provider_refund_fee_return(v_j.id);
 IF public.provider_refund_reserved(v_credit.id)>coalesce(public.customer_credit_remaining(v_credit.id,CURRENT_DATE),0) THEN RAISE EXCEPTION 'provider refund reservations exceed the remaining credit';END IF;
 IF public.provider_refund_reserved(NULL,v_receipt.id)+coalesce((SELECT sum(amount) FROM public.finance_customer_credit_uses WHERE settlement_id=v_receipt.id AND reversal_date IS NULL),0)>v_receipt.amount THEN RAISE EXCEPTION 'provider refunds exceed original receipt capacity';END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_provider_refund(p_job uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_j public.finance_provider_refunds%ROWTYPE;v_conn public.finance_connections%ROWTYPE;v_i public.finance_inbox%ROWTYPE;v_lease uuid:=gen_random_uuid();v_amount numeric;v_digest text;
BEGIN
 LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO v_j FROM public.finance_provider_refunds WHERE cancel_request IS NULL AND (p_job IS NULL OR id=p_job) AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<=now()) ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
 IF v_j.id IS NULL THEN RETURN NULL;END IF;PERFORM public.validate_provider_refund_graph(v_j.id);
 SELECT * INTO v_conn FROM public.finance_connections WHERE id=v_j.connection_id;SELECT * INTO v_i FROM public.finance_inbox WHERE id=v_j.inbox_id;
 SELECT amount INTO v_amount FROM public.customer_receipts WHERE id=v_j.receipt_id;SELECT md5(payload::text) INTO v_digest FROM public.finance_requests WHERE id=v_j.request_id;
 PERFORM set_config('tapaano.accounting_write','trusted',true);UPDATE public.finance_provider_refunds SET lease_token=v_lease,lease_until=now()+INTERVAL '5 minutes' WHERE id=v_j.id;
 RETURN jsonb_build_object('paymentMethod',v_j.payment_method,'maximumFee',v_j.maximum_fee::text,'jobId',v_j.id,'connectionId',v_j.connection_id,'leaseToken',v_lease,'environment',v_j.environment,'accountId',v_j.provider_account,'invoiceId',v_i.object_id,'receiptAmount',v_amount::text,'amount',v_j.amount::text,'approvalDigest',v_digest,'providerId',v_j.provider_id,'recoveryId',v_j.recovery_id,'preflight',v_j.preflight,'dispatchStartedAt',v_j.dispatch_started_at,'mayDispatch',v_conn.enabled AND v_conn.version=v_j.connection_version);
END; $$;

CREATE OR REPLACE FUNCTION public.mark_provider_refund_dispatch(p_job uuid,p_lease uuid,p_preflight jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_j public.finance_provider_refunds%ROWTYPE;v_conn public.finance_connections%ROWTYPE;
BEGIN
 LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;SELECT * INTO v_j FROM public.finance_provider_refunds WHERE id=p_job;
 IF v_j.id IS NULL OR v_j.lease_token IS DISTINCT FROM p_lease OR v_j.lease_until<=now() OR v_j.cancel_request IS NOT NULL THEN RAISE EXCEPTION 'provider refund lease unavailable';END IF;
 PERFORM public.validate_provider_refund_graph(v_j.id);SELECT * INTO v_conn FROM public.finance_connections WHERE id=v_j.connection_id;
 IF NOT v_conn.enabled OR v_conn.version<>v_j.connection_version THEN RAISE EXCEPTION 'provider refund connection changed before dispatch';END IF;
 IF v_j.provider_id IS NOT NULL THEN RETURN jsonb_build_object('maySend',false,'startedAt',v_j.dispatch_started_at);END IF;
 IF v_j.preflight IS NOT NULL AND v_j.preflight IS DISTINCT FROM p_preflight THEN RAISE EXCEPTION 'provider refund payment binding changed';END IF;
 PERFORM set_config('tapaano.accounting_write','trusted',true);
 UPDATE public.finance_provider_refunds SET preflight=p_preflight,dispatch_started_at=coalesce(dispatch_started_at,now()) WHERE id=v_j.id RETURNING * INTO v_j;
 PERFORM public.validate_provider_refund_graph(v_j.id);
 RETURN jsonb_build_object('maySend',v_j.dispatch_started_at>now()-INTERVAL '23 hours','startedAt',v_j.dispatch_started_at);
END; $$;

CREATE OR REPLACE FUNCTION public.get_provider_refund_report(p_entity uuid,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_j record;v_rows jsonb;v_total integer;v_next uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity AND org_id=v_org) OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'provider refund report unavailable';END IF;
 FOR v_j IN SELECT id FROM public.finance_provider_refunds WHERE entity_id=p_entity AND org_id=v_org LOOP PERFORM public.validate_provider_refund_graph(v_j.id);END LOOP;
 SELECT count(*) INTO v_total FROM public.finance_provider_refunds WHERE entity_id=p_entity AND org_id=v_org;
 WITH page AS(SELECT * FROM public.finance_provider_refunds WHERE entity_id=p_entity AND org_id=v_org AND (p_cursor IS NULL OR id>p_cursor) ORDER BY id LIMIT p_limit)
 SELECT coalesce(jsonb_agg(jsonb_build_object('paymentMethod',j.payment_method,'maximumFee',j.maximum_fee::text,'feeAccountId',j.fee_account_id,'returnFeeJournalId',j.return_fee_journal,'id',j.id,'entityId',j.entity_id,'connectionId',j.connection_id,'creditId',j.credit_id,'receiptId',j.receipt_id,'invoiceId',j.invoice_id,'reference',j.reference,'amount',j.amount::text,'date',j.as_of,'environment',j.environment,'accountId',j.provider_account,'requestId',j.request_id,'canceled',j.cancel_request IS NOT NULL,'dispatchStartedAt',j.dispatch_started_at,'providerId',j.provider_id,'proof',public.provider_refund_proof(j.id),'lastCheckedAt',j.last_checked_at,'lastError',j.last_error,'nextAttemptAt',j.next_attempt_at,'postingDate',public.provider_refund_date(j.id),'returnDate',public.provider_refund_date(j.id,true),'useId',u.id,'journalId',u.journal_id,'reversedOn',u.reversal_date,'reversalJournalId',u.reversal_journal,'observationCount',(SELECT count(*) FROM public.finance_provider_refund_observations WHERE refund_id=j.id)) ORDER BY j.id),'[]'),(array_agg(j.id ORDER BY j.id DESC))[1]
 INTO v_rows,v_next FROM page j LEFT JOIN public.finance_customer_credit_uses u ON u.id=j.use_id;
 RETURN jsonb_build_object('entityId',p_entity,'currency','USD','total',v_total,'refunds',v_rows,'nextCursor',CASE WHEN EXISTS(SELECT 1 FROM public.finance_provider_refunds WHERE entity_id=p_entity AND org_id=v_org AND id>v_next) THEN v_next END);
END; $$;

CREATE OR REPLACE FUNCTION public.guard_refund_fee_correction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.reversal_of_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.finance_provider_refunds WHERE return_fee_journal=NEW.reversal_of_id) THEN RAISE EXCEPTION 'retained refund fees require source-linked provider evidence; standalone reversal is prohibited';END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS refund_fee_correction ON public.journal_entries;
CREATE TRIGGER refund_fee_correction BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_refund_fee_correction();
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('refund_balance_fee','refund_balance_normalized','provider_refund_journal_lines','validate_provider_refund_fee_return','guard_refund_fee_correction','pre_tax_validate','pre_tax_execute') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
 END LOOP;
END; $$;
COMMIT;
