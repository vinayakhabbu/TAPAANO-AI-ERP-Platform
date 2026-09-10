BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.pre_provider_refund_validate(uuid,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.validate_finance_extension(uuid,text,jsonb) RENAME TO pre_provider_refund_validate;
  ALTER FUNCTION public.execute_finance_extension(public.finance_requests) RENAME TO pre_provider_refund_execute;
  ALTER FUNCTION public.finance_source_snapshot(uuid,text,jsonb) RENAME TO pre_provider_refund_snapshot;
  ALTER FUNCTION public.validate_customer_credit_use_graph(uuid) RENAME TO pre_provider_refund_use_graph;
  ALTER FUNCTION public.get_customer_adjustments(uuid,date) RENAME TO pre_provider_refund_adjustments;
  ALTER FUNCTION public.get_finance_close_check(uuid,date,date) RENAME TO pre_provider_refund_close;
 END IF;
END; $$;


-- Approval reserves an exact customer credit. A service worker records provider
-- evidence; an independent human approval posts the resulting clearing entry.
CREATE TABLE IF NOT EXISTS public.finance_provider_refunds (
 id uuid PRIMARY KEY,org_id uuid NOT NULL,entity_id uuid NOT NULL,connection_id uuid NOT NULL,inbox_id uuid NOT NULL,
 credit_id uuid NOT NULL,receipt_id uuid NOT NULL,invoice_id uuid NOT NULL,amount numeric(38,2) NOT NULL CHECK(amount>0),
 reference text NOT NULL,as_of date NOT NULL,provider_account text NOT NULL,environment text NOT NULL CHECK(environment IN ('TEST','LIVE')),
 connection_version integer NOT NULL,clearing_account_id uuid NOT NULL,timezone text NOT NULL,request_id uuid NOT NULL UNIQUE,
 cancel_request uuid,preflight jsonb,dispatch_started_at timestamptz,provider_id text,recovery_id text CHECK(recovery_id IS NULL OR recovery_id ~ '^re_[A-Za-z0-9]{1,180}$'),use_id uuid,
 lease_token uuid,lease_until timestamptz,next_attempt_at timestamptz NOT NULL DEFAULT now(),last_checked_at timestamptz,last_error text,
 UNIQUE(org_id,id),UNIQUE(provider_account,environment,provider_id),UNIQUE(use_id),
 CHECK((lease_token IS NULL)=(lease_until IS NULL)),CHECK((preflight IS NULL)=(dispatch_started_at IS NULL)),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,connection_id) REFERENCES public.finance_connections(org_id,id),
 FOREIGN KEY(org_id,inbox_id) REFERENCES public.finance_inbox(org_id,id),
 FOREIGN KEY(org_id,credit_id) REFERENCES public.finance_customer_credits(org_id,id),
 FOREIGN KEY(org_id,entity_id,receipt_id) REFERENCES public.customer_receipts(org_id,entity_id,id),
 FOREIGN KEY(org_id,entity_id,invoice_id) REFERENCES public.invoices(org_id,entity_id,id),
 FOREIGN KEY(org_id,clearing_account_id) REFERENCES public.accounts(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,cancel_request) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,use_id) REFERENCES public.finance_customer_credit_uses(org_id,id)
);
CREATE TABLE IF NOT EXISTS public.finance_provider_refund_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,refund_id uuid NOT NULL,lease_token uuid NOT NULL,
 observed_at timestamptz NOT NULL DEFAULT now(),proof jsonb NOT NULL,body_sha256 text NOT NULL CHECK(body_sha256 ~ '^[a-f0-9]{64}$'),
 UNIQUE(refund_id,lease_token),UNIQUE(org_id,id),FOREIGN KEY(org_id,refund_id) REFERENCES public.finance_provider_refunds(org_id,id)
);
CREATE INDEX IF NOT EXISTS provider_refund_queue ON public.finance_provider_refunds(next_attempt_at,id) WHERE cancel_request IS NULL;
CREATE INDEX IF NOT EXISTS provider_refund_credit ON public.finance_provider_refunds(credit_id);
CREATE INDEX IF NOT EXISTS provider_refund_observation_history ON public.finance_provider_refund_observations(refund_id,observed_at DESC,id DESC);

CREATE OR REPLACE FUNCTION public.provider_refund_proof(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT proof FROM public.finance_provider_refund_observations WHERE refund_id=p_id ORDER BY observed_at DESC,id DESC LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.provider_refund_reserved(p_credit uuid,p_receipt uuid DEFAULT NULL)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(sum(j.amount),0) FROM public.finance_provider_refunds j
 LEFT JOIN public.finance_customer_credit_uses u ON u.id=j.use_id
 WHERE (p_credit IS NULL OR j.credit_id=p_credit) AND (p_receipt IS NULL OR j.receipt_id=p_receipt) AND j.cancel_request IS NULL
 AND (u.id IS NULL OR u.reversal_date IS NOT NULL)
 AND coalesce(public.provider_refund_proof(j.id)->>'status','unknown') NOT IN ('failed','canceled')
$$;
CREATE OR REPLACE FUNCTION public.provider_refund_date(p_job uuid,p_failure boolean DEFAULT false)
RETURNS date LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT (to_timestamp((public.provider_refund_proof(j.id)->(CASE WHEN p_failure THEN 'failureBalance' ELSE 'balance' END)->>'created')::bigint) AT TIME ZONE j.timezone)::date
 FROM public.finance_provider_refunds j WHERE j.id=p_job
$$;

CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_c public.finance_customer_credits%ROWTYPE;v_i public.finance_inbox%ROWTYPE;v_conn public.finance_connections%ROWTYPE;
 v_receipt public.customer_receipts%ROWTYPE;v_job public.finance_provider_refunds%ROWTYPE;v_use public.finance_customer_credit_uses%ROWTYPE;v_amount numeric;v_result jsonb;v_proof jsonb;v_date date;
BEGIN
 IF p_kind='PROVIDER_REFUND' THEN
  IF p_payload-ARRAY['id','credit_id','event_id','amount','reference','date']<>'{}'::jsonb OR coalesce(p_payload->>'id','') !~ '^[a-f0-9-]{36}$' OR
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

CREATE OR REPLACE FUNCTION public.finance_source_snapshot(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;v_credit uuid;v_job public.finance_provider_refunds%ROWTYPE;v_org uuid:=public.get_user_org_id();
BEGIN
 IF p_kind='PROVIDER_REFUND' THEN
  RETURN jsonb_build_object('credit',(SELECT to_jsonb(c) FROM public.finance_customer_credits c WHERE id=(p_payload->>'credit_id')::uuid AND org_id=v_org AND entity_id=p_entity),
   'integration',public.pre_provider_refund_snapshot(p_entity,'INTEGRATION_APPLY',jsonb_build_object('event_id',p_payload->>'event_id')),
   'remaining',public.customer_credit_remaining((p_payload->>'credit_id')::uuid,CURRENT_DATE)::text,'reserved',public.provider_refund_reserved((p_payload->>'credit_id')::uuid)::text);
 ELSIF p_kind IN ('PROVIDER_REFUND_CANCEL','PROVIDER_REFUND_POST') THEN
  SELECT * INTO v_job FROM public.finance_provider_refunds WHERE id=(p_payload->>'job_id')::uuid AND entity_id=p_entity AND org_id=v_org;
  RETURN jsonb_build_object('job',to_jsonb(v_job)-ARRAY['lease_token','lease_until','next_attempt_at','last_checked_at'],'proof',public.provider_refund_proof(v_job.id));
 END IF;
 v_result:=public.pre_provider_refund_snapshot(p_entity,p_kind,p_payload);
 IF p_kind IN ('CUSTOMER_REFUND','CUSTOMER_CREDIT_APPLY','CUSTOMER_CREDIT_REVERSE','CUSTOMER_CREDIT_USE_REVERSE') THEN
  v_credit:=(p_payload->>'credit_id')::uuid;
  IF p_kind='CUSTOMER_CREDIT_USE_REVERSE' THEN SELECT credit_id INTO v_credit FROM public.finance_customer_credit_uses WHERE id=(p_payload->>'use_id')::uuid AND entity_id=p_entity AND org_id=v_org;END IF;
  v_result:=v_result||jsonb_build_object('providerRefunds',coalesce((SELECT jsonb_agg(jsonb_build_object('job',to_jsonb(j)-ARRAY['lease_token','lease_until','next_attempt_at','last_checked_at'],'proof',public.provider_refund_proof(j.id)) ORDER BY j.id) FROM public.finance_provider_refunds j WHERE j.credit_id=v_credit),'[]'));
 END IF;RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p jsonb:=p_request.payload;v_c public.finance_connections%ROWTYPE;v_i public.finance_inbox%ROWTYPE;v_credit public.finance_customer_credits%ROWTYPE;v_job public.finance_provider_refunds%ROWTYPE;v_id uuid;v_journal uuid;v_liability uuid;
BEGIN
 IF p_request.kind='PROVIDER_REFUND' THEN
  SELECT * INTO v_i FROM public.finance_inbox WHERE id=(v_p->>'event_id')::uuid;SELECT * INTO v_c FROM public.finance_connections WHERE id=v_i.connection_id;
  SELECT * INTO v_credit FROM public.finance_customer_credits WHERE id=(v_p->>'credit_id')::uuid;
  INSERT INTO public.finance_provider_refunds(id,org_id,entity_id,connection_id,inbox_id,credit_id,receipt_id,invoice_id,amount,reference,as_of,provider_account,environment,connection_version,clearing_account_id,timezone,request_id)
   VALUES((v_p->>'id')::uuid,p_request.org_id,p_request.entity_id,v_c.id,v_i.id,v_credit.id,(v_i.result->>'receiptId')::uuid,v_credit.invoice_id,public.cash_amount(v_p->>'amount'),v_p->>'reference',(v_p->>'date')::date,v_c.provider_account,v_c.environment,v_c.version,v_c.clearing_account_id,v_c.timezone,p_request.id) RETURNING id INTO v_id;
  RETURN jsonb_build_object('refundJobId',v_id);
 ELSIF p_request.kind='PROVIDER_REFUND_CANCEL' THEN
  UPDATE public.finance_provider_refunds SET cancel_request=p_request.id,lease_token=NULL,lease_until=NULL WHERE id=(v_p->>'job_id')::uuid;RETURN jsonb_build_object('canceled',v_p->>'job_id');
 ELSIF p_request.kind='PROVIDER_REFUND_POST' THEN
  SELECT * INTO v_job FROM public.finance_provider_refunds WHERE id=(v_p->>'job_id')::uuid;SELECT * INTO v_credit FROM public.finance_customer_credits WHERE id=v_job.credit_id;
  SELECT liability_account_id INTO v_liability FROM public.finance_customer_credit_controls WHERE id=v_credit.control_id;
  v_journal:=public.post_manual_journal(p_request.entity_id,'PROVIDER-REFUND-'||v_job.id,(v_p->>'date')::date,'Verified Stripe refund '||v_job.provider_id,public.finance_pair_lines(v_liability,v_job.clearing_account_id,v_job.amount),'finance:'||p_request.id||':provider-refund');
  INSERT INTO public.finance_customer_credit_uses(org_id,entity_id,credit_id,kind,as_of,amount,cash_account_id,settlement_id,settlement_kind,reference,journal_id,request_id)
   VALUES(p_request.org_id,p_request.entity_id,v_credit.id,'REFUND',(v_p->>'date')::date,v_job.amount,v_job.clearing_account_id,v_job.receipt_id,'RECEIPT',v_job.provider_id,v_journal,p_request.id) RETURNING id INTO v_id;
  UPDATE public.finance_provider_refunds SET use_id=v_id WHERE id=v_job.id;RETURN jsonb_build_object('refundJobId',v_job.id,'useId',v_id,'journalId',v_journal);
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
  IF v_balance<>'null'::jsonb AND (jsonb_typeof(v_balance) IS DISTINCT FROM 'object' OR v_balance-ARRAY['id','source','amount','currency','type','created']<>'{}'::jsonb OR
   coalesce(v_balance->>'id','') !~ '^txn_[A-Za-z0-9]{1,180}$' OR v_balance->>'source' IS DISTINCT FROM p_proof->>'id' OR v_balance->>'currency' IS DISTINCT FROM 'USD' OR
   jsonb_typeof(v_balance->'amount') IS DISTINCT FROM 'string' OR public.cash_amount(v_balance->>'amount') IS DISTINCT FROM v_expected OR
   coalesce(v_balance->>'type','') NOT IN ('refund','refund_failure','payment_refund','payment_failure_refund') OR coalesce(v_balance->>'created','') !~ '^[0-9]{1,11}$' OR
   (v_balance->>'created')::bigint<(p_proof->>'created')::bigint OR to_timestamp((v_balance->>'created')::bigint)>now()+INTERVAL '5 minutes') THEN RAISE EXCEPTION 'provider refund balance impact is invalid';END IF;
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
  v_r.payload IS DISTINCT FROM jsonb_build_object('id',v_j.id,'credit_id',v_j.credit_id,'event_id',v_j.inbox_id,'amount',v_r.payload->>'amount','reference',v_j.reference,'date',v_j.as_of) OR public.cash_amount(v_r.payload->>'amount') IS DISTINCT FROM v_j.amount OR
  v_c.org_id IS DISTINCT FROM v_j.org_id OR v_c.entity_id IS DISTINCT FROM v_j.entity_id OR v_c.provider<>'STRIPE' OR v_c.currency<>'USD' OR v_c.provider_account<>v_j.provider_account OR v_c.environment<>v_j.environment OR v_c.clearing_account_id<>v_j.clearing_account_id OR v_c.timezone<>v_j.timezone OR
  v_r.source_snapshot->'integration'->>'connection_version' IS DISTINCT FROM v_j.connection_version::text OR
  v_i.org_id IS DISTINCT FROM v_j.org_id OR v_i.connection_id IS DISTINCT FROM v_j.connection_id OR v_i.operation<>'RECEIPT' OR v_i.result->>'receiptId' IS DISTINCT FROM v_j.receipt_id::text OR
  v_credit.org_id IS DISTINCT FROM v_j.org_id OR v_credit.entity_id IS DISTINCT FROM v_j.entity_id OR v_credit.invoice_id IS DISTINCT FROM v_j.invoice_id OR
  v_receipt.org_id IS DISTINCT FROM v_j.org_id OR v_receipt.entity_id IS DISTINCT FROM v_j.entity_id OR v_receipt.invoice_id IS DISTINCT FROM v_j.invoice_id OR v_j.as_of<greatest(v_credit.as_of,v_receipt.receipt_date) THEN RAISE EXCEPTION 'provider refund approval or original payment graph is invalid';END IF;
 PERFORM public.validate_customer_credit_graph(v_credit.id);PERFORM public.validate_integration_graph(v_i.id);
 IF EXISTS(SELECT 1 FROM public.finance_provider_refunds WHERE provider_account=v_j.provider_account AND environment=v_j.environment AND connection_id<>v_j.connection_id) THEN RAISE EXCEPTION 'provider refund account has conflicting tenant ownership';END IF;
 IF v_j.cancel_request IS NOT NULL AND (v_j.dispatch_started_at IS NOT NULL OR v_j.provider_id IS NOT NULL OR v_j.use_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_j.cancel_request AND org_id=v_j.org_id AND entity_id=v_j.entity_id AND kind='PROVIDER_REFUND_CANCEL' AND payload=jsonb_build_object('job_id',v_j.id) AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by)) THEN RAISE EXCEPTION 'provider refund cancellation graph is invalid';END IF;
 IF v_j.preflight IS NOT NULL THEN
  IF jsonb_typeof(v_j.preflight) IS DISTINCT FROM 'object' OR v_j.preflight-ARRAY['invoiceId','paymentId','paymentIntentId','chargeId','receiptAmount','currency','accountId','environment']<>'{}'::jsonb OR
   v_j.preflight->>'invoiceId' IS DISTINCT FROM v_i.object_id OR v_j.preflight->>'accountId' IS DISTINCT FROM v_j.provider_account OR v_j.preflight->>'environment' IS DISTINCT FROM v_j.environment OR v_j.preflight->>'currency' IS DISTINCT FROM 'USD' OR
   coalesce(v_j.preflight->>'paymentId','') !~ '^inpay_[A-Za-z0-9]{1,180}$' OR coalesce(v_j.preflight->>'paymentIntentId','') !~ '^pi_[A-Za-z0-9]{1,180}$' OR coalesce(v_j.preflight->>'chargeId','') !~ '^ch_[A-Za-z0-9]{1,180}$' OR
   jsonb_typeof(v_j.preflight->'receiptAmount') IS DISTINCT FROM 'string' OR public.cash_amount(v_j.preflight->>'receiptAmount') IS DISTINCT FROM v_receipt.amount THEN RAISE EXCEPTION 'provider refund verified payment binding is invalid';END IF;
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
   v_r.kind IS DISTINCT FROM 'PROVIDER_REFUND_POST' OR v_r.org_id IS DISTINCT FROM v_j.org_id OR v_r.entity_id IS DISTINCT FROM v_j.entity_id OR v_r.state NOT IN ('APPROVED','EXECUTING') OR v_r.requested_by=v_r.decided_by OR v_r.payload IS DISTINCT FROM jsonb_build_object('job_id',v_j.id,'date',v_u.as_of) OR
   v_r.source_snapshot->'proof'->>'status' IS DISTINCT FROM 'succeeded' OR (to_timestamp((v_r.source_snapshot->'proof'->'balance'->>'created')::bigint) AT TIME ZONE v_j.timezone)::date IS DISTINCT FROM v_u.as_of OR
   NOT EXISTS(SELECT 1 FROM public.finance_provider_refund_observations WHERE refund_id=v_j.id AND proof=v_r.source_snapshot->'proof') THEN RAISE EXCEPTION 'provider refund posting approval graph is invalid';END IF;
  SELECT liability_account_id INTO v_liability FROM public.finance_customer_credit_controls WHERE id=v_credit.control_id;v_lines:=public.finance_pair_lines(v_liability,v_j.clearing_account_id,v_j.amount);
  PERFORM public.assert_finance_journal(v_u.journal_id,v_j.org_id,v_j.entity_id,v_u.as_of,v_lines,v_u.reversal_journal);
  IF v_u.reversal_date IS NOT NULL THEN
   SELECT * INTO v_r FROM public.finance_requests WHERE id=v_u.reversal_request;
   IF v_r.kind IS DISTINCT FROM 'CUSTOMER_CREDIT_USE_REVERSE' OR v_r.org_id IS DISTINCT FROM v_j.org_id OR v_r.entity_id IS DISTINCT FROM v_j.entity_id OR v_r.state NOT IN ('APPROVED','EXECUTING') OR v_r.requested_by=v_r.decided_by OR v_r.payload IS DISTINCT FROM jsonb_build_object('use_id',v_u.id,'date',v_u.reversal_date) OR v_u.reversal_date<v_u.as_of OR NOT EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_r.source_snapshot->'providerRefunds') s JOIN public.finance_provider_refund_observations o ON o.refund_id=v_j.id AND o.proof=s->'proof'
    WHERE s->'job'->>'id'=v_j.id::text AND s->'proof'->>'status' IN ('failed','canceled') AND (to_timestamp((s->'proof'->'failureBalance'->>'created')::bigint) AT TIME ZONE v_j.timezone)::date=v_u.reversal_date
   ) THEN RAISE EXCEPTION 'provider refund return correction graph is invalid';END IF;
   PERFORM public.assert_finance_journal(v_u.reversal_journal,v_j.org_id,v_j.entity_id,v_u.reversal_date,public.flip_finance_lines(v_lines),NULL,v_u.journal_id);
  ELSIF v_u.reversal_journal IS NOT NULL OR v_u.reversal_request IS NOT NULL THEN RAISE EXCEPTION 'incomplete provider refund return correction';END IF;
 END IF;
 IF public.provider_refund_reserved(v_credit.id)>coalesce(public.customer_credit_remaining(v_credit.id,CURRENT_DATE),0) THEN RAISE EXCEPTION 'provider refund reservations exceed the remaining credit';END IF;
 IF public.provider_refund_reserved(NULL,v_receipt.id)+coalesce((SELECT sum(amount) FROM public.finance_customer_credit_uses WHERE settlement_id=v_receipt.id AND reversal_date IS NULL),0)>v_receipt.amount THEN RAISE EXCEPTION 'provider refunds exceed original receipt capacity';END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.validate_customer_credit_use_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_job uuid;
BEGIN
 SELECT id INTO v_job FROM public.finance_provider_refunds WHERE use_id=p_id;
 IF v_job IS NULL THEN PERFORM public.pre_provider_refund_use_graph(p_id);ELSE PERFORM public.validate_provider_refund_graph(v_job);END IF;
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
 RETURN jsonb_build_object('jobId',v_j.id,'connectionId',v_j.connection_id,'leaseToken',v_lease,'environment',v_j.environment,'accountId',v_j.provider_account,'invoiceId',v_i.object_id,'receiptAmount',v_amount::text,'amount',v_j.amount::text,'approvalDigest',v_digest,'providerId',v_j.provider_id,'recoveryId',v_j.recovery_id,'preflight',v_j.preflight,'dispatchStartedAt',v_j.dispatch_started_at,'mayDispatch',v_conn.enabled AND v_conn.version=v_j.connection_version);
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
CREATE OR REPLACE FUNCTION public.record_provider_refund_observation(p_job uuid,p_lease uuid,p_proof jsonb,p_body_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_j public.finance_provider_refunds%ROWTYPE;v_old public.finance_provider_refund_observations%ROWTYPE;v_id uuid;v_time timestamptz;v_previous jsonb;
BEGIN
 LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;SELECT * INTO v_j FROM public.finance_provider_refunds WHERE id=p_job;
 SELECT * INTO v_old FROM public.finance_provider_refund_observations WHERE refund_id=p_job AND lease_token=p_lease;
 IF v_old.id IS NOT NULL THEN
  IF v_old.proof IS DISTINCT FROM p_proof OR v_old.body_sha256 IS DISTINCT FROM p_body_sha256 THEN RAISE EXCEPTION 'provider refund observation idempotency conflict';END IF;
  RETURN jsonb_build_object('observationId',v_old.id,'status',v_old.proof->>'status');
 END IF;
 IF v_j.id IS NULL OR v_j.lease_token IS DISTINCT FROM p_lease OR v_j.lease_until<=now() OR v_j.cancel_request IS NOT NULL OR v_j.dispatch_started_at IS NULL THEN RAISE EXCEPTION 'provider refund observation lease unavailable';END IF;
 IF v_j.provider_id IS NOT NULL AND v_j.provider_id IS DISTINCT FROM p_proof->>'id' THEN RAISE EXCEPTION 'provider refund identity changed';END IF;
 PERFORM public.validate_provider_refund_graph(v_j.id);PERFORM public.validate_provider_refund_evidence(v_j,p_proof);
 v_previous:=public.provider_refund_proof(v_j.id);
 IF v_previous->>'status' IN ('failed','canceled') AND p_proof->>'status' NOT IN ('failed','canceled') THEN RAISE EXCEPTION 'terminal provider refund status changed; independent investigation required';END IF;
 PERFORM set_config('tapaano.accounting_write','trusted',true);
 INSERT INTO public.finance_provider_refund_observations(org_id,refund_id,lease_token,proof,body_sha256) VALUES(v_j.org_id,v_j.id,p_lease,p_proof,p_body_sha256) RETURNING id,observed_at INTO v_id,v_time;
 UPDATE public.finance_provider_refunds SET provider_id=p_proof->>'id',last_checked_at=v_time,last_error=NULL,lease_token=NULL,lease_until=NULL,next_attempt_at=now()+CASE WHEN p_proof->>'status' IN ('pending','requires_action') THEN INTERVAL '5 minutes' ELSE INTERVAL '6 hours' END WHERE id=v_j.id;
 PERFORM public.validate_provider_refund_graph(v_j.id);RETURN jsonb_build_object('observationId',v_id,'status',p_proof->>'status');
END; $$;
CREATE OR REPLACE FUNCTION public.release_provider_refund(p_job uuid,p_lease uuid,p_error text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
 IF p_error IS NULL OR p_error NOT IN ('CONFIGURATION','PROVIDER_UNAVAILABLE','RATE_LIMITED','INVALID_SOURCE','DATABASE_UNAVAILABLE','DISPATCH_UNCERTAIN','RECOVERY_REQUIRED') THEN RAISE EXCEPTION 'invalid provider refund recovery status';END IF;
 PERFORM set_config('tapaano.accounting_write','trusted',true);
 UPDATE public.finance_provider_refunds SET lease_token=NULL,lease_until=NULL,last_error=p_error,next_attempt_at=now()+CASE WHEN p_error='RECOVERY_REQUIRED' THEN INTERVAL '6 hours' ELSE INTERVAL '5 minutes' END WHERE id=p_job AND lease_token=p_lease;
END; $$;
CREATE OR REPLACE FUNCTION public.request_provider_refund_check(p_job uuid,p_provider_id text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();
BEGIN
 PERFORM public.assert_accounting_actor(v_org);LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
 IF NOT EXISTS(SELECT 1 FROM public.finance_provider_refunds WHERE id=p_job AND org_id=v_org AND cancel_request IS NULL) THEN RAISE EXCEPTION 'provider refund unavailable';END IF;
 IF p_provider_id IS NOT NULL AND (p_provider_id !~ '^re_[A-Za-z0-9]{1,180}$' OR NOT EXISTS(SELECT 1 FROM public.finance_provider_refunds WHERE id=p_job AND org_id=v_org AND dispatch_started_at IS NOT NULL AND provider_id IS NULL)) THEN RAISE EXCEPTION 'recovery reference requires an uncertain dispatched refund';END IF;
 PERFORM set_config('tapaano.accounting_write','trusted',true);
 UPDATE public.finance_provider_refunds SET recovery_id=p_provider_id,next_attempt_at=greatest(now(),coalesce(last_checked_at,now()-INTERVAL '1 minute')+INTERVAL '1 minute') WHERE id=p_job AND org_id=v_org;
END; $$;

CREATE OR REPLACE FUNCTION public.get_provider_refund_report(p_entity uuid,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_j record;v_rows jsonb;v_total integer;v_next uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity AND org_id=v_org) OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'provider refund report unavailable';END IF;
 FOR v_j IN SELECT id FROM public.finance_provider_refunds WHERE entity_id=p_entity AND org_id=v_org LOOP PERFORM public.validate_provider_refund_graph(v_j.id);END LOOP;
 SELECT count(*) INTO v_total FROM public.finance_provider_refunds WHERE entity_id=p_entity AND org_id=v_org;
 WITH page AS(SELECT * FROM public.finance_provider_refunds WHERE entity_id=p_entity AND org_id=v_org AND (p_cursor IS NULL OR id>p_cursor) ORDER BY id LIMIT p_limit)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',j.id,'entityId',j.entity_id,'connectionId',j.connection_id,'creditId',j.credit_id,'receiptId',j.receipt_id,'invoiceId',j.invoice_id,'reference',j.reference,'amount',j.amount::text,'date',j.as_of,'environment',j.environment,'accountId',j.provider_account,'requestId',j.request_id,'canceled',j.cancel_request IS NOT NULL,'dispatchStartedAt',j.dispatch_started_at,'providerId',j.provider_id,'proof',public.provider_refund_proof(j.id),'lastCheckedAt',j.last_checked_at,'lastError',j.last_error,'nextAttemptAt',j.next_attempt_at,'postingDate',public.provider_refund_date(j.id),'returnDate',public.provider_refund_date(j.id,true),'useId',u.id,'journalId',u.journal_id,'reversedOn',u.reversal_date,'reversalJournalId',u.reversal_journal,'observationCount',(SELECT count(*) FROM public.finance_provider_refund_observations WHERE refund_id=j.id)) ORDER BY j.id),'[]'),(array_agg(j.id ORDER BY j.id DESC))[1]
 INTO v_rows,v_next FROM page j LEFT JOIN public.finance_customer_credit_uses u ON u.id=j.use_id;
 RETURN jsonb_build_object('entityId',p_entity,'currency','USD','total',v_total,'refunds',v_rows,'nextCursor',CASE WHEN EXISTS(SELECT 1 FROM public.finance_provider_refunds WHERE entity_id=p_entity AND org_id=v_org AND id>v_next) THEN v_next END);
END; $$;
CREATE OR REPLACE FUNCTION public.get_customer_adjustments(p_entity uuid,p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_r jsonb;v_credit jsonb;v_credits jsonb:='[]';v_uses jsonb;v_reserved numeric;v_id uuid;v_j record;
BEGIN
 v_r:=public.pre_provider_refund_adjustments(p_entity,p_as_of)-'revision';
 FOR v_j IN SELECT id FROM public.finance_provider_refunds WHERE entity_id=p_entity AND org_id=public.get_user_org_id() LOOP PERFORM public.validate_provider_refund_graph(v_j.id);END LOOP;
 FOR v_credit IN SELECT value FROM jsonb_array_elements(v_r->'credits') LOOP
  v_id:=(v_credit->>'id')::uuid;v_reserved:=public.provider_refund_reserved(v_id);
  SELECT coalesce(jsonb_agg(u||jsonb_build_object('providerRefundId',(SELECT id FROM public.finance_provider_refunds WHERE use_id=(u->>'id')::uuid)) ORDER BY u->>'date',u->>'id'),'[]') INTO v_uses FROM jsonb_array_elements(v_credit->'uses') u;
  v_credits:=v_credits||jsonb_build_array(v_credit||jsonb_build_object('uses',v_uses,'providerReserved',v_reserved::numeric(38,2)::text,'availableToUse',greatest(0,(v_credit->>'remaining')::numeric-v_reserved)::numeric(38,2)::text));
 END LOOP;
 v_r:=v_r||jsonb_build_object('credits',v_credits);
 RETURN v_r||jsonb_build_object('revision',md5(v_r::text));
END; $$;
CREATE OR REPLACE FUNCTION public.get_finance_close_check(p_entity uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_r jsonb;v_j record;v_count integer;
BEGIN
 v_r:=public.pre_provider_refund_close(p_entity,p_from,p_through);
 FOR v_j IN SELECT id FROM public.finance_provider_refunds WHERE entity_id=p_entity AND org_id=public.get_user_org_id() LOOP PERFORM public.validate_provider_refund_graph(v_j.id);END LOOP;
 SELECT count(*) INTO v_count FROM public.finance_provider_refunds j LEFT JOIN public.finance_customer_credit_uses u ON u.id=j.use_id
 WHERE j.entity_id=p_entity AND j.org_id=public.get_user_org_id() AND j.cancel_request IS NULL AND j.as_of<=p_through AND (
  j.last_error IS NOT NULL OR j.last_checked_at IS NULL OR j.last_checked_at<now()-INTERVAL '24 hours' OR
  public.provider_refund_proof(j.id)->>'status' IN ('pending','requires_action') OR
  (u.id IS NULL AND coalesce(public.provider_refund_proof(j.id)->>'status','unknown') NOT IN ('failed','canceled')) OR
  (u.id IS NOT NULL AND u.reversal_date IS NULL AND public.provider_refund_proof(j.id)->>'status' IN ('failed','canceled') AND public.provider_refund_date(j.id,true)<=p_through));
 RETURN v_r||jsonb_build_object('providerRefundExceptions',v_count,'canClose',(v_r->>'canClose')::boolean AND v_count=0);
END; $$;
CREATE OR REPLACE FUNCTION public.get_provider_refund_evidence(p_job uuid,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_j public.finance_provider_refunds%ROWTYPE;v_cursor_time timestamptz;v_rows jsonb;v_ids uuid[];v_next uuid;
BEGIN
 SELECT * INTO v_j FROM public.finance_provider_refunds WHERE id=p_job AND org_id=public.get_user_org_id();
 IF v_j.id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'provider refund evidence unavailable';END IF;
 PERFORM public.validate_provider_refund_graph(v_j.id);
 IF p_cursor IS NOT NULL THEN SELECT observed_at INTO v_cursor_time FROM public.finance_provider_refund_observations WHERE id=p_cursor AND refund_id=p_job;IF v_cursor_time IS NULL THEN RAISE EXCEPTION 'provider refund evidence cursor unavailable';END IF;END IF;
 SELECT array_agg(id ORDER BY observed_at DESC,id DESC) INTO v_ids FROM (SELECT id,observed_at FROM public.finance_provider_refund_observations WHERE refund_id=p_job AND (p_cursor IS NULL OR (observed_at,id)<(v_cursor_time,p_cursor)) ORDER BY observed_at DESC,id DESC LIMIT p_limit+1) x;
 IF coalesce(array_length(v_ids,1),0)>p_limit THEN v_next:=v_ids[p_limit];END IF;v_ids:=v_ids[1:p_limit];
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'observedAt',observed_at,'proof',proof,'bodySha256',body_sha256) ORDER BY observed_at DESC,id DESC),'[]') INTO v_rows FROM public.finance_provider_refund_observations WHERE id=ANY(v_ids);
 RETURN jsonb_build_object('jobId',p_job,'dispatchApprovalId',v_j.request_id,'preflight',v_j.preflight,'observations',v_rows,'total',(SELECT count(*) FROM public.finance_provider_refund_observations WHERE refund_id=p_job),'nextCursor',v_next);
END; $$;
CREATE OR REPLACE FUNCTION public.check_provider_refund_graph_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='finance_provider_refunds' THEN PERFORM public.validate_provider_refund_graph(NEW.id);
 ELSE PERFORM public.validate_provider_refund_graph(NEW.refund_id);END IF;RETURN NULL;
END; $$;
DO $$ DECLARE t text;f record;
BEGIN
 FOREACH t IN ARRAY ARRAY['finance_provider_refunds','finance_provider_refund_observations'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(org_id=public.get_user_org_id())',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS provider_refund_graph ON public.%I',t);EXECUTE format('CREATE CONSTRAINT TRIGGER provider_refund_graph AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_provider_refund_graph_trigger()',t);
 END LOOP;
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
  ('pre_provider_refund_validate','pre_provider_refund_execute','pre_provider_refund_snapshot','pre_provider_refund_use_graph','pre_provider_refund_adjustments','pre_provider_refund_close','validate_finance_extension','execute_finance_extension','finance_source_snapshot','provider_refund_proof','provider_refund_reserved','provider_refund_date','validate_provider_refund_evidence','validate_provider_refund_graph','validate_customer_credit_use_graph','claim_provider_refund','mark_provider_refund_dispatch','record_provider_refund_observation','release_provider_refund','request_provider_refund_check','get_provider_refund_report','get_provider_refund_evidence','get_customer_adjustments','get_finance_close_check','check_provider_refund_graph_trigger') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname IN ('claim_provider_refund','mark_provider_refund_dispatch','record_provider_refund_observation','release_provider_refund') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  ELSIF f.proname IN ('request_provider_refund_check','get_provider_refund_report','get_provider_refund_evidence','get_customer_adjustments','get_finance_close_check') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
END; $$;
COMMIT;
