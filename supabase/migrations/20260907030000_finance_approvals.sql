BEGIN;
CREATE TABLE IF NOT EXISTS public.finance_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,
 kind text NOT NULL,payload jsonb NOT NULL,source_snapshot jsonb NOT NULL DEFAULT '{}',reason text NOT NULL,request_key text NOT NULL,
 requested_by uuid NOT NULL REFERENCES auth.users(id),requested_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','EXECUTING','APPROVED','REJECTED','WITHDRAWN')),
 decided_by uuid REFERENCES auth.users(id),decided_at timestamptz,decision_reason text,result jsonb,
 UNIQUE(org_id,id),UNIQUE(org_id,request_key),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 CHECK(decided_by IS NULL OR decided_by<>requested_by OR state='WITHDRAWN')
);
CREATE TABLE IF NOT EXISTS public.finance_approval_policies (
 id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 org_id uuid NOT NULL,entity_id uuid PRIMARY KEY,journals_required boolean NOT NULL,payments_required boolean NOT NULL,
 version integer NOT NULL,request_id uuid NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id)
);

-- Extensions implement only named, reviewed workflows. No caller-selected SQL/RPC is executed.
CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'finance workflow is unavailable: %',p_kind; END; $$;
CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'finance workflow is unavailable: %',p_request.kind; END; $$;

CREATE OR REPLACE FUNCTION public.finance_source_snapshot(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT '{}'::jsonb $$;

CREATE OR REPLACE FUNCTION public.validate_finance_request(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_line jsonb;v_d numeric:=0;v_c numeric:=0;v_amount numeric;
BEGIN
 PERFORM public.assert_accounting_actor(v_org);
 IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity AND org_id=v_org) THEN RAISE EXCEPTION 'entity unavailable'; END IF;
 IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text)>200000 THEN RAISE EXCEPTION 'invalid approval payload'; END IF;
 CASE p_kind
 WHEN 'MANUAL_JOURNAL' THEN
  IF p_payload-ARRAY['number','date','memo','lines']<>'{}'::jsonb OR length(coalesce(p_payload->>'number','')) NOT BETWEEN 1 AND 80 OR length(coalesce(p_payload->>'memo','')) NOT BETWEEN 1 AND 1000 OR jsonb_typeof(p_payload->'lines') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'journal number, date, memo and lines required'; END IF;
  IF coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (p_payload->>'date')::date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' OR jsonb_array_length(p_payload->'lines') NOT BETWEEN 2 AND 500 THEN RAISE EXCEPTION 'invalid journal date or lines'; END IF;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
   IF jsonb_typeof(v_line->'debit') IS DISTINCT FROM 'string' OR jsonb_typeof(v_line->'credit') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'journal amounts require exact decimal strings'; END IF;
   IF v_line-ARRAY['account_id','debit','credit','memo']<>'{}'::jsonb OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(v_line->>'account_id')::uuid AND org_id=v_org AND is_active) THEN RAISE EXCEPTION 'invalid journal account'; END IF;
   IF NOT ((public.cash_amount(v_line->>'debit')>0 AND public.cash_amount(v_line->>'credit')=0) OR (public.cash_amount(v_line->>'credit')>0 AND public.cash_amount(v_line->>'debit')=0)) THEN RAISE EXCEPTION 'invalid journal amount'; END IF;
   v_d:=v_d+public.cash_amount(v_line->>'debit');v_c:=v_c+public.cash_amount(v_line->>'credit');
  END LOOP;
  IF v_d<>v_c OR v_d=0 THEN RAISE EXCEPTION 'journal must balance'; END IF;
 WHEN 'SUPPLIER_PAYMENT' THEN
  IF jsonb_typeof(p_payload->'amount') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'payment requires an exact decimal string'; END IF;
  IF p_payload-ARRAY['bill_id','number','date','amount','reference']<>'{}'::jsonb OR length(coalesce(p_payload->>'number','')) NOT BETWEEN 1 AND 80 OR length(coalesce(p_payload->>'reference','')) NOT BETWEEN 1 AND 240 THEN RAISE EXCEPTION 'payment fields required'; END IF;
  v_amount:=public.cash_amount(p_payload->>'amount');
  IF v_amount<=0 OR coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR NOT EXISTS(SELECT 1 FROM public.bills WHERE id=(p_payload->>'bill_id')::uuid AND org_id=v_org AND entity_id=p_entity AND accounting_status='POSTED') THEN RAISE EXCEPTION 'payment source or amount unavailable'; END IF;
 WHEN 'SUPPLIER_PAYMENT_CORRECTION','SUPPLIER_PAYMENT_REPLACEMENT','JOURNAL_REVERSAL' THEN
  IF p_payload-ARRAY['source_id','number','date','reference']<>'{}'::jsonb OR coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR length(coalesce(p_payload->>'reference','')) NOT BETWEEN 1 AND 240 OR (p_kind<>'JOURNAL_REVERSAL' AND length(coalesce(p_payload->>'number','')) NOT BETWEEN 1 AND 80) THEN RAISE EXCEPTION 'correction source, date and reference required'; END IF;
  IF (p_kind='SUPPLIER_PAYMENT_CORRECTION' AND NOT EXISTS(SELECT 1 FROM public.supplier_payments WHERE id=(p_payload->>'source_id')::uuid AND org_id=v_org AND entity_id=p_entity)) OR
   (p_kind='SUPPLIER_PAYMENT_REPLACEMENT' AND NOT EXISTS(SELECT 1 FROM public.supplier_payment_corrections WHERE id=(p_payload->>'source_id')::uuid AND org_id=v_org AND entity_id=p_entity)) OR
   (p_kind='JOURNAL_REVERSAL' AND NOT EXISTS(SELECT 1 FROM public.journal_entries WHERE id=(p_payload->>'source_id')::uuid AND org_id=v_org AND entity_id=p_entity AND source_module='gl' AND status='posted')) THEN RAISE EXCEPTION 'correction source unavailable'; END IF;
 WHEN 'APPROVAL_POLICY' THEN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'policy change requires an administrator'; END IF;
  IF p_payload-ARRAY['journals_required','payments_required','expected_version']<>'{}'::jsonb OR jsonb_typeof(p_payload->'journals_required') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_payload->'payments_required') IS DISTINCT FROM 'boolean' OR coalesce(p_payload->>'expected_version','') !~ '^[0-9]{1,8}$' THEN RAISE EXCEPTION 'invalid approval policy'; END IF;
 ELSE RETURN public.validate_finance_extension(p_entity,p_kind,p_payload);
 END CASE;
 RETURN p_payload;
END; $$;

CREATE OR REPLACE FUNCTION public.request_finance_action(p_entity_id uuid,p_kind text,p_payload jsonb,p_reason text,p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_actor uuid;v_payload jsonb;v_r public.finance_requests%ROWTYPE;v_id uuid;
BEGIN
 v_actor:=public.assert_accounting_actor(v_org);
 IF p_key IS NULL OR length(btrim(p_key)) NOT BETWEEN 1 AND 200 OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'retry key and approval reason required'; END IF;
 LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO v_r FROM public.finance_requests WHERE org_id=v_org AND request_key=p_key;
 IF v_r.id IS NOT NULL THEN
  IF v_r.entity_id<>p_entity_id OR v_r.kind IS DISTINCT FROM p_kind OR v_r.payload IS DISTINCT FROM p_payload OR v_r.reason<>p_reason OR v_r.requested_by<>v_actor THEN RAISE EXCEPTION 'approval request idempotency conflict'; END IF;
  RETURN v_r.id;
 END IF;
 v_payload:=public.validate_finance_request(p_entity_id,p_kind,p_payload);
 PERFORM set_config('tapaano.accounting_write','trusted',true);
 INSERT INTO public.finance_requests(org_id,entity_id,kind,payload,source_snapshot,reason,request_key,requested_by)
  VALUES(v_org,p_entity_id,p_kind,v_payload,public.finance_source_snapshot(p_entity_id,p_kind,v_payload),p_reason,p_key,v_actor) RETURNING id INTO v_id;
 RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.decide_finance_action(p_request_id uuid,p_decision text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_actor uuid;v_r public.finance_requests%ROWTYPE;v_result jsonb;v_id uuid;v_currency text;v_version integer;
BEGIN
 v_actor:=public.assert_accounting_actor(v_org);
 IF p_decision IS NULL OR p_decision NOT IN ('APPROVE','REJECT','WITHDRAW') OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'decision and evidence required'; END IF;
 LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO v_r FROM public.finance_requests WHERE id=p_request_id AND org_id=v_org;
 IF v_r.id IS NULL THEN RAISE EXCEPTION 'approval request unavailable'; END IF;
 IF (p_decision='WITHDRAW' AND v_actor<>v_r.requested_by) OR (p_decision<>'WITHDRAW' AND v_actor=v_r.requested_by) THEN RAISE EXCEPTION 'an independent reviewer is required; only the requester can withdraw'; END IF;
 IF v_r.state<>'PENDING' THEN
  IF v_r.decided_by=v_actor AND v_r.decision_reason=p_reason AND v_r.state=(CASE p_decision WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'WITHDRAWN' END) THEN RETURN v_r.result; END IF;
  RAISE EXCEPTION 'approval request already decided';
 END IF;
 PERFORM set_config('tapaano.accounting_write','trusted',true);
 IF p_decision='APPROVE' THEN
  IF v_r.source_snapshot IS DISTINCT FROM public.finance_source_snapshot(v_r.entity_id,v_r.kind,v_r.payload) THEN RAISE EXCEPTION 'approval source changed; reject or withdraw and submit a fresh proposal'; END IF;
  PERFORM public.validate_finance_request(v_r.entity_id,v_r.kind,v_r.payload);
  UPDATE public.finance_requests SET state='EXECUTING',decided_by=v_actor WHERE id=v_r.id;
  PERFORM set_config('tapaano.finance_request',v_r.id::text,true);
  CASE v_r.kind
  WHEN 'MANUAL_JOURNAL' THEN
   v_id:=public.post_manual_journal(v_r.entity_id,v_r.payload->>'number',(v_r.payload->>'date')::date,v_r.payload->>'memo',v_r.payload->'lines','finance:'||v_r.id);
   v_result:=jsonb_build_object('journalId',v_id);
  WHEN 'SUPPLIER_PAYMENT' THEN
   SELECT currency INTO v_currency FROM public.entities WHERE id=v_r.entity_id;
   v_id:=public.post_supplier_payment_amount((v_r.payload->>'bill_id')::uuid,v_r.payload->>'number',(v_r.payload->>'date')::date,v_currency,v_r.payload->>'reference','finance:'||v_r.id,public.cash_amount(v_r.payload->>'amount'));
   v_result:=jsonb_build_object('paymentId',v_id);
  WHEN 'SUPPLIER_PAYMENT_CORRECTION' THEN
   v_id:=public.post_supplier_payment_correction((v_r.payload->>'source_id')::uuid,v_r.payload->>'number',(v_r.payload->>'date')::date,v_r.payload->>'reference','finance:'||v_r.id);
   v_result:=jsonb_build_object('correctionId',v_id);
  WHEN 'SUPPLIER_PAYMENT_REPLACEMENT' THEN
   v_id:=public.post_supplier_payment_replacement((v_r.payload->>'source_id')::uuid,v_r.payload->>'number',(v_r.payload->>'date')::date,v_r.payload->>'reference','finance:'||v_r.id);
   v_result:=jsonb_build_object('replacementId',v_id);
  WHEN 'JOURNAL_REVERSAL' THEN
   v_id:=public.reverse_posted_journal((v_r.payload->>'source_id')::uuid,(v_r.payload->>'date')::date,v_r.payload->>'reference','finance:'||v_r.id);
   v_result:=jsonb_build_object('reversalId',v_id);
  WHEN 'APPROVAL_POLICY' THEN
   SELECT coalesce(max(version),0) INTO v_version FROM public.finance_approval_policies WHERE entity_id=v_r.entity_id;
   IF v_version<>(v_r.payload->>'expected_version')::int THEN RAISE EXCEPTION 'approval policy changed; submit against the current version'; END IF;
   INSERT INTO public.finance_approval_policies(org_id,entity_id,journals_required,payments_required,version,request_id)
    VALUES(v_org,v_r.entity_id,(v_r.payload->>'journals_required')::boolean,(v_r.payload->>'payments_required')::boolean,v_version+1,v_r.id)
    ON CONFLICT(entity_id) DO UPDATE SET journals_required=excluded.journals_required,payments_required=excluded.payments_required,version=excluded.version,request_id=excluded.request_id,updated_at=now();
   v_result:=jsonb_build_object('version',v_version+1);
  ELSE v_result:=public.execute_finance_extension(v_r);
  END CASE;
  PERFORM set_config('tapaano.finance_request','',true);
 END IF;
 UPDATE public.finance_requests SET state=CASE p_decision WHEN 'APPROVE' THEN 'APPROVED' WHEN 'REJECT' THEN 'REJECTED' ELSE 'WITHDRAWN' END,
  decided_by=v_actor,decided_at=now(),decision_reason=p_reason,result=v_result WHERE id=v_r.id;
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_finance_approval_posting()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_required boolean;v_request uuid;
BEGIN
 SELECT CASE WHEN NEW.source_module='gl' THEN journals_required ELSE payments_required END INTO v_required
  FROM public.finance_approval_policies WHERE entity_id=NEW.entity_id AND org_id=NEW.org_id;
 IF coalesce(v_required,false) AND (NEW.source_module='gl' OR NEW.source_module IN ('ap_payment','ap_payment_correction','ap_payment_replacement')) THEN
  v_request:=nullif(current_setting('tapaano.finance_request',true),'')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_request AND org_id=NEW.org_id AND entity_id=NEW.entity_id AND state='EXECUTING' AND decided_by=auth.uid() AND requested_by<>auth.uid()) THEN RAISE EXCEPTION 'independent finance approval is required for this posting'; END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS finance_approval_posting ON public.journal_entries;
CREATE TRIGGER finance_approval_posting BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_finance_approval_posting();

DO $$ DECLARE t text;f record;
BEGIN
 FOREACH t IN ARRAY ARRAY['finance_requests','finance_approval_policies'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(org_id=public.get_user_org_id())',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);
  EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);
  EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
 END LOOP;
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
  ('validate_finance_extension','execute_finance_extension','finance_source_snapshot','validate_finance_request','request_finance_action','decide_finance_action','guard_finance_approval_posting') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname IN ('request_finance_action','decide_finance_action') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END; $$;
COMMIT;
