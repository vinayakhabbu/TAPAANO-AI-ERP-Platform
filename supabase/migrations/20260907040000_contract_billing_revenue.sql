BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_id_id_banking_uidx ON public.invoices(org_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS customer_credit_notes_org_id_id_uidx ON public.customer_credit_notes(org_id,id);
CREATE TABLE IF NOT EXISTS public.finance_contracts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,customer_id uuid NOT NULL,
 reference text NOT NULL,currency text NOT NULL,terms jsonb NOT NULL,creation_request uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(org_id,id),UNIQUE(org_id,reference),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,customer_id) REFERENCES public.customers(org_id,id),
 FOREIGN KEY(org_id,creation_request) REFERENCES public.finance_requests(org_id,id)
);
CREATE TABLE IF NOT EXISTS public.finance_contract_cycles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,contract_id uuid NOT NULL,cycle_number integer NOT NULL,
 starts_on date NOT NULL,ends_on date NOT NULL,price numeric(15,2) NOT NULL,allocations jsonb NOT NULL,
 usage_finalized boolean NOT NULL,usage_revision text,usage_units numeric,finalization_request uuid,
 invoice_id uuid,invoice_date date,billing_request uuid,deferral_journal uuid,unbilled_transfer_journal uuid,
 credit_id uuid,credit_date date,credit_request uuid,credit_journal uuid,cancel_request uuid,
 UNIQUE(org_id,id),UNIQUE(contract_id,cycle_number),UNIQUE(invoice_id),
 FOREIGN KEY(org_id,contract_id) REFERENCES public.finance_contracts(org_id,id),
 FOREIGN KEY(org_id,invoice_id) REFERENCES public.invoices(org_id,id),
 FOREIGN KEY(org_id,deferral_journal) REFERENCES public.journal_entries(org_id,id),
 FOREIGN KEY(org_id,unbilled_transfer_journal) REFERENCES public.journal_entries(org_id,id),
 FOREIGN KEY(org_id,credit_journal) REFERENCES public.journal_entries(org_id,id),
 FOREIGN KEY(org_id,credit_id) REFERENCES public.customer_credit_notes(org_id,id),
 FOREIGN KEY(org_id,billing_request) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,finalization_request) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,credit_request) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,cancel_request) REFERENCES public.finance_requests(org_id,id),
 CHECK(ends_on>=starts_on AND price>=0 AND price::text NOT IN ('NaN','Infinity','-Infinity'))
);
CREATE TABLE IF NOT EXISTS public.finance_usage_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,contract_id uuid NOT NULL,cycle_id uuid NOT NULL,
 source text NOT NULL,external_id text NOT NULL,occurred_at timestamptz NOT NULL,units numeric NOT NULL,
 correction_of uuid,recorded_by uuid NOT NULL REFERENCES auth.users(id),recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id),UNIQUE(contract_id,source,external_id),UNIQUE(correction_of),
 FOREIGN KEY(org_id,contract_id) REFERENCES public.finance_contracts(org_id,id),
 FOREIGN KEY(org_id,cycle_id) REFERENCES public.finance_contract_cycles(org_id,id),
 FOREIGN KEY(org_id,correction_of) REFERENCES public.finance_usage_events(org_id,id),
 CHECK(units<>0 AND abs(units)<=999999999999999 AND round(units,6)=units AND units::text NOT IN ('NaN','Infinity','-Infinity'))
);
CREATE TABLE IF NOT EXISTS public.finance_revenue_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,cycle_id uuid NOT NULL,as_of date NOT NULL,
 amount numeric(15,2) NOT NULL,allocations jsonb NOT NULL,request_id uuid NOT NULL,journal_id uuid NOT NULL,transfer_journal uuid,
 evidence jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(org_id,id),UNIQUE(request_id),
 FOREIGN KEY(org_id,cycle_id) REFERENCES public.finance_contract_cycles(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,journal_id) REFERENCES public.journal_entries(org_id,id),
 FOREIGN KEY(org_id,transfer_journal) REFERENCES public.journal_entries(org_id,id),
 CHECK(amount>0 AND amount::text NOT IN ('NaN','Infinity','-Infinity'))
);
CREATE TABLE IF NOT EXISTS public.finance_contract_amendments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,contract_id uuid NOT NULL,effective_cycle integer NOT NULL,
 action text NOT NULL,new_price numeric(15,2),request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id),UNIQUE(request_id),
 FOREIGN KEY(org_id,contract_id) REFERENCES public.finance_contracts(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id)
);
CREATE INDEX IF NOT EXISTS finance_cycles_contract ON public.finance_contract_cycles(contract_id,starts_on);
CREATE INDEX IF NOT EXISTS finance_usage_cycle ON public.finance_usage_events(cycle_id,occurred_at);
CREATE INDEX IF NOT EXISTS finance_revenue_cycle ON public.finance_revenue_entries(cycle_id,as_of);

CREATE OR REPLACE FUNCTION public.allocate_contract_price(p_price numeric,p_obligations jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v_total numeric;v_running numeric:=0;v_prior numeric:=0;v_share numeric;v_o jsonb;v_result jsonb:='[]';
BEGIN
 SELECT sum(public.cash_amount(value->>'standalone_price')) INTO v_total FROM jsonb_array_elements(p_obligations);
 IF v_total IS NULL OR v_total<=0 THEN RAISE EXCEPTION 'standalone prices must be positive'; END IF;
 FOR v_o IN SELECT value FROM jsonb_array_elements(p_obligations) LOOP
  v_running:=v_running+public.cash_amount(v_o->>'standalone_price');v_share:=round(p_price*v_running/v_total,2)-v_prior;v_prior:=v_prior+v_share;
  v_result:=v_result||jsonb_build_array(v_o||jsonb_build_object('amount',v_share::text));
 END LOOP;
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.record_contract_usage(p_contract_id uuid,p_source text,p_external_id text,p_occurred_at timestamptz,p_units text,p_correction_of uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_actor uuid;v_c public.finance_contracts%ROWTYPE;v_cycle public.finance_contract_cycles%ROWTYPE;v_old public.finance_usage_events%ROWTYPE;v_id uuid;v_units numeric;v_date date;
BEGIN
 v_actor:=public.assert_accounting_actor(v_org);
 SELECT * INTO v_c FROM public.finance_contracts WHERE id=p_contract_id AND org_id=v_org;
 IF v_c.id IS NULL OR v_c.terms->>'kind'<>'USAGE' THEN RAISE EXCEPTION 'usage contract unavailable'; END IF;
 IF p_source IS NULL OR length(btrim(p_source)) NOT BETWEEN 1 AND 100 OR p_external_id IS NULL OR length(btrim(p_external_id)) NOT BETWEEN 1 AND 150 OR p_units IS NULL OR p_units !~ '^-?[0-9]{1,15}(\.[0-9]{1,6})?$' OR p_occurred_at IS NULL OR NOT isfinite(p_occurred_at) THEN RAISE EXCEPTION 'invalid usage source, time or exact quantity'; END IF;
 v_units:=p_units::numeric;v_date:=(p_occurred_at AT TIME ZONE (v_c.terms->>'timezone'))::date;
 LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO v_old FROM public.finance_usage_events WHERE contract_id=v_c.id AND source=p_source AND external_id=p_external_id;
 IF v_old.id IS NOT NULL THEN
  IF v_old.occurred_at<>p_occurred_at OR v_old.units<>v_units OR v_old.correction_of IS DISTINCT FROM p_correction_of THEN RAISE EXCEPTION 'usage idempotency conflict'; END IF;
  RETURN v_old.id;
 END IF;
 SELECT * INTO v_cycle FROM public.finance_contract_cycles WHERE contract_id=v_c.id AND v_date BETWEEN starts_on AND ends_on;
 IF v_cycle.id IS NULL OR v_cycle.usage_finalized OR v_cycle.cancel_request IS NOT NULL THEN RAISE EXCEPTION 'usage cycle is unavailable or finalized; late data requires an explicit adjustment'; END IF;
 IF p_correction_of IS NOT NULL THEN
  SELECT * INTO v_old FROM public.finance_usage_events WHERE id=p_correction_of AND org_id=v_org AND contract_id=v_c.id AND cycle_id=v_cycle.id AND correction_of IS NULL;
  IF v_old.id IS NULL OR v_units<>-v_old.units OR p_occurred_at<>v_old.occurred_at THEN RAISE EXCEPTION 'usage correction must exactly offset an original event at its original time'; END IF;
 ELSIF v_units<=0 THEN RAISE EXCEPTION 'original usage quantity must be positive'; END IF;
 PERFORM set_config('tapaano.accounting_write','trusted',true);
 INSERT INTO public.finance_usage_events(org_id,contract_id,cycle_id,source,external_id,occurred_at,units,correction_of,recorded_by)
  VALUES(v_org,v_c.id,v_cycle.id,p_source,p_external_id,p_occurred_at,v_units,p_correction_of,v_actor) RETURNING id INTO v_id;
 RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.contract_usage_snapshot(p_cycle_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('units',coalesce(sum(units),0)::text,'count',count(*),'revision',md5(coalesce(jsonb_agg(jsonb_build_array(id,source,external_id,occurred_at,units,correction_of) ORDER BY id),'[]'::jsonb)::text))
 FROM public.finance_usage_events WHERE cycle_id=p_cycle_id
$$;

CREATE OR REPLACE FUNCTION public.contract_earned(p_cycle_id uuid,p_as_of date,p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cycle public.finance_contract_cycles%ROWTYPE;v_contract public.finance_contracts%ROWTYPE;v_o jsonb;v_e jsonb;v_value numeric;v_result jsonb:='[]';v_units numeric;v_ratio numeric;
BEGIN
 SELECT * INTO v_cycle FROM public.finance_contract_cycles WHERE id=p_cycle_id;
 SELECT * INTO v_contract FROM public.finance_contracts WHERE id=v_cycle.contract_id;
 IF NOT v_cycle.usage_finalized THEN RAISE EXCEPTION 'finalize the usage control total before revenue recognition'; END IF;
 IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' OR jsonb_array_length(p_evidence)>20 THEN RAISE EXCEPTION 'invalid fulfillment evidence'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_evidence) e WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_cycle.allocations) o WHERE o->>'key'=e->>'key' AND o->>'method'='MILESTONE')) OR
    (SELECT count(*) FROM jsonb_array_elements(p_evidence))<>(SELECT count(DISTINCT e->>'key') FROM jsonb_array_elements(p_evidence) e) THEN RAISE EXCEPTION 'unknown or duplicate performance obligation'; END IF;
 FOR v_o IN SELECT value FROM jsonb_array_elements(v_cycle.allocations) LOOP
  v_value:=0;
  IF v_o->>'method'='DAILY' THEN
   v_ratio:=greatest(0,least(p_as_of,v_cycle.ends_on)-v_cycle.starts_on+1)::numeric/(v_cycle.ends_on-v_cycle.starts_on+1);
   v_value:=round((v_o->>'amount')::numeric*v_ratio,2);
  ELSIF v_o->>'method'='USAGE' THEN
   SELECT coalesce(sum(units),0) INTO v_units FROM public.finance_usage_events WHERE cycle_id=v_cycle.id AND (occurred_at AT TIME ZONE (v_contract.terms->>'timezone'))::date<=p_as_of;
   v_value:=CASE WHEN coalesce(v_cycle.usage_units,0)=0 THEN 0 ELSE round(v_cycle.price*v_units/v_cycle.usage_units,2) END;
  ELSE
   SELECT value INTO v_e FROM jsonb_array_elements(p_evidence) WHERE value->>'key'=v_o->>'key';
   IF v_e IS NOT NULL THEN
    IF v_e-ARRAY['key','satisfied_on','reference']<>'{}'::jsonb OR coalesce(v_e->>'satisfied_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR length(coalesce(v_e->>'reference','')) NOT BETWEEN 1 AND 500 OR (v_e->>'satisfied_on')::date NOT BETWEEN v_cycle.starts_on AND least(p_as_of,v_cycle.ends_on) THEN RAISE EXCEPTION 'milestone requires dated transfer evidence within the service period'; END IF;
    v_value:=(v_o->>'amount')::numeric;
   ELSIF EXISTS(SELECT 1 FROM public.finance_revenue_entries r CROSS JOIN LATERAL jsonb_array_elements(r.evidence) e WHERE r.cycle_id=v_cycle.id AND r.as_of<=p_as_of AND e->>'key'=v_o->>'key') THEN v_value:=(v_o->>'amount')::numeric;
   END IF;
  END IF;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('key',v_o->>'key','amount',round(v_value,2)::text));
 END LOOP;
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_o jsonb;v_c public.finance_contracts%ROWTYPE;v_cycle public.finance_contract_cycles%ROWTYPE;v_date date;v_months integer;
BEGIN
 CASE p_kind
 WHEN 'CONTRACT_CREATE' THEN
  IF p_payload-ARRAY['customer_id','reference','kind','starts_on','ends_on','cycle_months','price','unit_price','timezone','deferred_account_id','unbilled_account_id','obligations']<>'{}'::jsonb OR
   length(coalesce(p_payload->>'reference','')) NOT BETWEEN 1 AND 80 OR coalesce(p_payload->>'kind','') NOT IN ('FIXED','USAGE') OR
   coalesce(p_payload->>'starts_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_payload->>'ends_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'invalid contract terms'; END IF;
  IF (p_payload->>'starts_on')::date<DATE '0001-01-01' OR (p_payload->>'ends_on')::date>(p_payload->>'starts_on')::date+INTERVAL '10 years' OR (p_payload->>'ends_on')::date<(p_payload->>'starts_on')::date OR (p_payload->>'ends_on')::date>DATE '9998-12-31' THEN RAISE EXCEPTION 'contract service period must be valid and at most ten years'; END IF;
  IF coalesce(p_payload->>'cycle_months','') NOT IN ('0','1','3','12') THEN RAISE EXCEPTION 'billing cycle must be once, monthly, quarterly or annual'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.customers WHERE id=(p_payload->>'customer_id')::uuid AND org_id=v_org) OR NOT EXISTS(SELECT 1 FROM public.entity_invoice_account_controls WHERE entity_id=p_entity AND org_id=v_org) THEN RAISE EXCEPTION 'customer or invoice posting setup unavailable'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE org_id=v_org AND id=(p_payload->>'deferred_account_id')::uuid AND is_active AND account_type='liability') OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE org_id=v_org AND id=(p_payload->>'unbilled_account_id')::uuid AND is_active AND account_type='asset') THEN RAISE EXCEPTION 'active deferred liability and unbilled asset accounts required'; END IF;
  IF EXISTS(SELECT 1 FROM public.entity_invoice_account_controls WHERE entity_id=p_entity AND ar_account_id=(p_payload->>'unbilled_account_id')::uuid) OR EXISTS(SELECT 1 FROM public.cash_registers WHERE entity_id=p_entity AND account_id=(p_payload->>'unbilled_account_id')::uuid) THEN RAISE EXCEPTION 'unbilled receivable requires its own control account'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_payload->>'timezone') THEN RAISE EXCEPTION 'accounting timezone required'; END IF;
  IF jsonb_typeof(p_payload->'obligations') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'obligations') NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'one to twenty performance obligations required'; END IF;
  IF (SELECT count(*) FROM jsonb_array_elements(p_payload->'obligations'))<>(SELECT count(DISTINCT value->>'key') FROM jsonb_array_elements(p_payload->'obligations')) THEN RAISE EXCEPTION 'performance obligation keys must be unique'; END IF;
  FOR v_o IN SELECT value FROM jsonb_array_elements(p_payload->'obligations') LOOP
   IF jsonb_typeof(v_o->'standalone_price') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'standalone prices require exact decimal strings'; END IF;
   IF v_o-ARRAY['key','description','standalone_price','method']<>'{}'::jsonb OR length(coalesce(v_o->>'key','')) NOT BETWEEN 1 AND 60 OR length(coalesce(v_o->>'description','')) NOT BETWEEN 1 AND 500 OR public.cash_amount(v_o->>'standalone_price')<=0 OR coalesce(v_o->>'method','') NOT IN ('DAILY','MILESTONE','USAGE') THEN RAISE EXCEPTION 'invalid performance obligation'; END IF;
   IF (p_payload->>'kind'='USAGE') IS DISTINCT FROM (v_o->>'method'='USAGE') THEN RAISE EXCEPTION 'usage and fixed obligations require separate contracts'; END IF;
  END LOOP;
  IF p_payload->>'kind'='FIXED' THEN
   IF jsonb_typeof(p_payload->'price') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'contract price requires an exact decimal string'; END IF;
   IF public.cash_amount(p_payload->>'price')<=0 THEN RAISE EXCEPTION 'contract price must be positive'; END IF;
  ELSE
   IF jsonb_typeof(p_payload->'unit_price') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'unit price requires an exact decimal string'; END IF;
   IF jsonb_array_length(p_payload->'obligations')<>1 OR coalesce(p_payload->>'unit_price','') !~ '^[0-9]{1,8}(\.[0-9]{1,8})?$' OR (p_payload->>'unit_price')::numeric<=0 THEN RAISE EXCEPTION 'usage requires one obligation and a positive exact unit price'; END IF;
  END IF;
 WHEN 'CONTRACT_AMEND' THEN
  IF p_payload-ARRAY['contract_id','effective_cycle','action','new_price']<>'{}'::jsonb OR coalesce(p_payload->>'effective_cycle','') !~ '^[0-9]{1,3}$' OR coalesce(p_payload->>'action','') NOT IN ('REPRICE','CANCEL') THEN RAISE EXCEPTION 'invalid prospective amendment'; END IF;
  SELECT * INTO v_c FROM public.finance_contracts WHERE id=(p_payload->>'contract_id')::uuid AND entity_id=p_entity AND org_id=v_org;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'contract unavailable'; END IF;
  IF p_payload->>'action'='REPRICE' AND (v_c.terms->>'kind'<>'FIXED' OR public.cash_amount(p_payload->>'new_price')<=0) THEN RAISE EXCEPTION 'repricing requires a positive fixed-cycle price'; END IF;
  IF p_payload->>'action'='REPRICE' AND jsonb_typeof(p_payload->'new_price') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'repricing requires an exact decimal string'; END IF;
 ELSE
  IF p_kind NOT IN ('CONTRACT_USAGE_CLOSE','CONTRACT_BILL','CONTRACT_RECOGNIZE','CONTRACT_CREDIT') OR p_kind IS NULL THEN RAISE EXCEPTION 'finance workflow unavailable'; END IF;
  SELECT * INTO v_cycle FROM public.finance_contract_cycles WHERE id=(p_payload->>'cycle_id')::uuid AND org_id=v_org;
  SELECT * INTO v_c FROM public.finance_contracts WHERE id=v_cycle.contract_id AND entity_id=p_entity AND org_id=v_org;
  IF v_c.id IS NULL OR v_cycle.cancel_request IS NOT NULL OR v_cycle.credit_id IS NOT NULL THEN RAISE EXCEPTION 'contract cycle unavailable'; END IF;
  IF p_kind='CONTRACT_USAGE_CLOSE' THEN
   IF jsonb_typeof(p_payload->'expected_units') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'usage control total requires an exact decimal string'; END IF;
   IF p_payload-ARRAY['cycle_id','revision','expected_units']<>'{}'::jsonb OR v_c.terms->>'kind'<>'USAGE' OR coalesce(p_payload->>'expected_units','') !~ '^[0-9]{1,15}(\.[0-9]{1,6})?$' THEN RAISE EXCEPTION 'usage control total required'; END IF;
  ELSIF p_kind='CONTRACT_BILL' THEN
   IF p_payload-ARRAY['cycle_id','number','issue_date','due_date']<>'{}'::jsonb OR length(coalesce(p_payload->>'number','')) NOT BETWEEN 1 AND 80 OR coalesce(p_payload->>'issue_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_payload->>'due_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (p_payload->>'due_date')::date<(p_payload->>'issue_date')::date THEN RAISE EXCEPTION 'invoice number and valid dates required'; END IF;
  ELSIF p_kind='CONTRACT_RECOGNIZE' THEN
   IF p_payload-ARRAY['cycle_id','as_of','evidence']<>'{}'::jsonb OR coalesce(p_payload->>'as_of','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'recognition cutoff and evidence required'; END IF;
   v_date:=(p_payload->>'as_of')::date;
   IF v_date<v_cycle.starts_on OR v_date>v_cycle.ends_on OR v_date>CURRENT_DATE THEN RAISE EXCEPTION 'recognition must fall within delivered service dates and cannot be in the future'; END IF;
   PERFORM public.contract_earned(v_cycle.id,v_date,p_payload->'evidence');
  ELSE
   IF p_payload-ARRAY['cycle_id','number','date']<>'{}'::jsonb OR length(coalesce(p_payload->>'number','')) NOT BETWEEN 1 AND 80 OR coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'credit number and date required'; END IF;
  END IF;
 END CASE;
 RETURN p_payload;
END; $$;

CREATE OR REPLACE FUNCTION public.post_contract_transfer(p_contract public.finance_contracts,p_request uuid,p_suffix text,p_date date,p_debit uuid,p_credit uuid,p_amount numeric)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_amount=0 THEN RETURN NULL; END IF;
 RETURN public.post_manual_journal(p_contract.entity_id,'CONTRACT-'||p_request||'-'||p_suffix,p_date,p_contract.reference||' / '||p_suffix,
  jsonb_build_array(jsonb_build_object('account_id',p_debit,'debit',round(p_amount,2)::text,'credit','0.00'),jsonb_build_object('account_id',p_credit,'debit','0.00','credit',round(p_amount,2)::text)),
  'contract:'||p_request||':'||p_suffix);
END; $$;

CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p jsonb:=p_request.payload;v_c public.finance_contracts%ROWTYPE;v_cycle public.finance_contract_cycles%ROWTYPE;
 v_id uuid;v_journal uuid;v_transfer uuid;v_invoice uuid;v_currency text;v_revenue uuid;v_deferred uuid;v_unbilled uuid;
 v_start date;v_end date;v_next date;v_date date;v_origin date;v_months integer;v_n integer:=0;v_price numeric;v_recognized numeric;v_before numeric;
 v_snapshot jsonb;v_earned jsonb;v_delta jsonb;v_amount numeric;v_o jsonb;
BEGIN
 IF p_request.kind='CONTRACT_CREATE' THEN
  SELECT currency INTO v_currency FROM public.entities WHERE id=p_request.entity_id;
  INSERT INTO public.finance_contracts(org_id,entity_id,customer_id,reference,currency,terms,creation_request)
   VALUES(p_request.org_id,p_request.entity_id,(v_p->>'customer_id')::uuid,v_p->>'reference',v_currency,v_p,p_request.id) RETURNING * INTO v_c;
  v_origin:=(v_p->>'starts_on')::date;v_start:=v_origin;v_months:=(v_p->>'cycle_months')::integer;
  LOOP
   EXIT WHEN v_start>(v_p->>'ends_on')::date;
   v_next:=CASE WHEN v_months=0 THEN (v_p->>'ends_on')::date+1 ELSE (v_origin+make_interval(months=>(v_n+1)*v_months))::date END;
   v_end:=least(v_next-1,(v_p->>'ends_on')::date);
   v_price:=CASE WHEN v_p->>'kind'='USAGE' THEN 0 ELSE round(public.cash_amount(v_p->>'price')*(v_end-v_start+1)::numeric/(v_next-v_start),2) END;
   INSERT INTO public.finance_contract_cycles(org_id,contract_id,cycle_number,starts_on,ends_on,price,allocations,usage_finalized)
    VALUES(p_request.org_id,v_c.id,v_n+1,v_start,v_end,v_price,public.allocate_contract_price(v_price,v_p->'obligations'),v_p->>'kind'='FIXED');
   v_n:=v_n+1;v_start:=v_next;
  END LOOP;
  RETURN jsonb_build_object('contractId',v_c.id,'cycles',v_n);
 END IF;
 IF p_request.kind='CONTRACT_AMEND' THEN
  SELECT * INTO v_c FROM public.finance_contracts WHERE id=(v_p->>'contract_id')::uuid AND org_id=p_request.org_id;
  IF NOT EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE contract_id=v_c.id AND cycle_number=(v_p->>'effective_cycle')::int) OR EXISTS(
   SELECT 1 FROM public.finance_contract_cycles s WHERE s.contract_id=v_c.id AND s.cycle_number>=(v_p->>'effective_cycle')::int AND
    (s.billing_request IS NOT NULL OR s.finalization_request IS NOT NULL OR s.cancel_request IS NOT NULL OR EXISTS(SELECT 1 FROM public.finance_revenue_entries WHERE cycle_id=s.id) OR EXISTS(SELECT 1 FROM public.finance_usage_events WHERE cycle_id=s.id))) THEN RAISE EXCEPTION 'amendment requires untouched future cycles'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE contract_id=v_c.id AND cycle_number=(v_p->>'effective_cycle')::int AND starts_on<CURRENT_DATE) THEN RAISE EXCEPTION 'amendments are prospective at a future cycle boundary'; END IF;
  INSERT INTO public.finance_contract_amendments(org_id,contract_id,effective_cycle,action,new_price,request_id)
   VALUES(p_request.org_id,v_c.id,(v_p->>'effective_cycle')::int,v_p->>'action',CASE WHEN v_p->>'action'='REPRICE' THEN public.cash_amount(v_p->>'new_price') END,p_request.id);
  FOR v_cycle IN SELECT * FROM public.finance_contract_cycles WHERE contract_id=v_c.id AND cycle_number>=(v_p->>'effective_cycle')::int LOOP
   IF v_p->>'action'='CANCEL' THEN UPDATE public.finance_contract_cycles SET cancel_request=p_request.id WHERE id=v_cycle.id;
   ELSE
    v_next:=CASE WHEN (v_c.terms->>'cycle_months')::int=0 THEN v_cycle.ends_on+1 ELSE ((v_c.terms->>'starts_on')::date+make_interval(months=>v_cycle.cycle_number*(v_c.terms->>'cycle_months')::int))::date END;
    v_price:=round(public.cash_amount(v_p->>'new_price')*(v_cycle.ends_on-v_cycle.starts_on+1)::numeric/(v_next-v_cycle.starts_on),2);
    UPDATE public.finance_contract_cycles SET price=v_price,allocations=public.allocate_contract_price(v_price,v_c.terms->'obligations') WHERE id=v_cycle.id;
   END IF;
  END LOOP;
  RETURN jsonb_build_object('contractId',v_c.id,'action',v_p->>'action');
 END IF;
 SELECT * INTO v_cycle FROM public.finance_contract_cycles WHERE id=(v_p->>'cycle_id')::uuid AND org_id=p_request.org_id;
 SELECT * INTO v_c FROM public.finance_contracts WHERE id=v_cycle.contract_id;
 SELECT revenue_account_id INTO v_revenue FROM public.entity_invoice_account_controls WHERE entity_id=v_c.entity_id;
 v_deferred:=(v_c.terms->>'deferred_account_id')::uuid;v_unbilled:=(v_c.terms->>'unbilled_account_id')::uuid;
 SELECT coalesce(sum(amount),0) INTO v_recognized FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id;
 CASE p_request.kind
 WHEN 'CONTRACT_USAGE_CLOSE' THEN
  IF v_cycle.usage_finalized THEN RAISE EXCEPTION 'usage is already finalized'; END IF;
  v_snapshot:=public.contract_usage_snapshot(v_cycle.id);
  IF v_snapshot->>'revision' IS DISTINCT FROM v_p->>'revision' OR (v_snapshot->>'units')::numeric IS DISTINCT FROM (v_p->>'expected_units')::numeric THEN RAISE EXCEPTION 'usage changed or source control total disagrees'; END IF;
  IF v_cycle.ends_on>CURRENT_DATE THEN RAISE EXCEPTION 'usage service period must have ended before finalization'; END IF;
  v_price:=round((v_snapshot->>'units')::numeric*(v_c.terms->>'unit_price')::numeric,2);
  IF v_price<0 OR v_price>9999999999999.99 THEN RAISE EXCEPTION 'usage price outside supported bounds'; END IF;
  UPDATE public.finance_contract_cycles SET price=v_price,allocations=public.allocate_contract_price(v_price,v_c.terms->'obligations'),usage_finalized=true,usage_units=(v_snapshot->>'units')::numeric,usage_revision=v_snapshot->>'revision',finalization_request=p_request.id WHERE id=v_cycle.id;
  RETURN jsonb_build_object('cycleId',v_cycle.id,'amount',v_price::text,'units',v_snapshot->>'units');
 WHEN 'CONTRACT_BILL' THEN
  IF NOT v_cycle.usage_finalized OR v_cycle.billing_request IS NOT NULL THEN RAISE EXCEPTION 'cycle is not finalized or is already billed'; END IF;
  v_date:=(v_p->>'issue_date')::date;
  IF v_c.terms->>'kind'='USAGE' AND v_date<=v_cycle.ends_on THEN RAISE EXCEPTION 'usage is billed in arrears after the service period'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id AND as_of>v_date) THEN RAISE EXCEPTION 'invoice date must follow unbilled recognition; do not backdate across recognized history'; END IF;
  IF v_cycle.price>0 THEN
   v_invoice:=public.post_customer_invoice(v_c.entity_id,v_c.customer_id,v_p->>'number',v_date,(v_p->>'due_date')::date,v_c.currency,0,v_c.reference||' service '||v_cycle.starts_on||' through '||v_cycle.ends_on,
    jsonb_build_array(jsonb_build_object('description',v_c.reference||' cycle '||v_cycle.cycle_number,'quantity','1','unit_price',v_cycle.price::text)),'contract-invoice:'||v_cycle.id);
   v_journal:=public.post_contract_transfer(v_c,p_request.id,'DEFER',v_date,v_revenue,v_deferred,v_cycle.price);
   v_transfer:=public.post_contract_transfer(v_c,p_request.id,'UNBILLED',v_date,v_deferred,v_unbilled,v_recognized);
  END IF;
  UPDATE public.finance_contract_cycles SET invoice_id=v_invoice,invoice_date=v_date,billing_request=p_request.id,deferral_journal=v_journal,unbilled_transfer_journal=v_transfer WHERE id=v_cycle.id;
  RETURN jsonb_build_object('cycleId',v_cycle.id,'invoiceId',v_invoice,'amount',v_cycle.price::text);
 WHEN 'CONTRACT_RECOGNIZE' THEN
  v_date:=(v_p->>'as_of')::date;
  IF EXISTS(SELECT 1 FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id AND as_of>v_date) THEN RAISE EXCEPTION 'recognition must advance in date order'; END IF;
  v_earned:=public.contract_earned(v_cycle.id,v_date,v_p->'evidence');v_delta:='[]';v_amount:=0;
  FOR v_o IN SELECT value FROM jsonb_array_elements(v_earned) LOOP
   SELECT coalesce(sum((a->>'amount')::numeric),0) INTO v_before FROM public.finance_revenue_entries e CROSS JOIN LATERAL jsonb_array_elements(e.allocations) a WHERE e.cycle_id=v_cycle.id AND a->>'key'=v_o->>'key';
   v_price:=(v_o->>'amount')::numeric-v_before;
   IF v_price<0 THEN RAISE EXCEPTION 'fulfillment evidence would reduce previously recognized revenue'; END IF;
   v_amount:=v_amount+v_price;v_delta:=v_delta||jsonb_build_array(jsonb_build_object('key',v_o->>'key','amount',round(v_price,2)::text));
  END LOOP;
  IF v_amount<=0 OR v_recognized+v_amount>v_cycle.price THEN RAISE EXCEPTION 'no additional earned revenue is available'; END IF;
  v_journal:=public.post_contract_transfer(v_c,p_request.id,'RECOGNIZE',v_date,CASE WHEN v_cycle.invoice_id IS NOT NULL AND v_cycle.invoice_date<=v_date THEN v_deferred ELSE v_unbilled END,v_revenue,v_amount);
  IF v_cycle.invoice_id IS NOT NULL AND v_cycle.invoice_date>v_date THEN
   v_transfer:=public.post_contract_transfer(v_c,p_request.id,'UNBILLED',v_cycle.invoice_date,v_deferred,v_unbilled,v_amount);
  END IF;
  INSERT INTO public.finance_revenue_entries(org_id,cycle_id,as_of,amount,allocations,request_id,journal_id,transfer_journal,evidence)
   VALUES(p_request.org_id,v_cycle.id,v_date,v_amount,v_delta,p_request.id,v_journal,v_transfer,v_p->'evidence') RETURNING id INTO v_id;
  RETURN jsonb_build_object('recognitionId',v_id,'journalId',v_journal,'amount',round(v_amount,2)::text);
 WHEN 'CONTRACT_CREDIT' THEN
  v_date:=(v_p->>'date')::date;
  IF v_cycle.invoice_id IS NULL OR v_date<v_cycle.invoice_date OR EXISTS(SELECT 1 FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id AND as_of>v_date) THEN RAISE EXCEPTION 'credit requires an invoice and must follow all recognized history'; END IF;
  v_id:=public.post_customer_credit_note(v_cycle.invoice_id,v_p->>'number',v_date,p_request.reason,'contract-credit:'||v_cycle.id);
  v_journal:=public.post_contract_transfer(v_c,p_request.id,'CREDIT-DEFERRED',v_date,v_deferred,v_revenue,v_cycle.price-v_recognized);
  UPDATE public.finance_contract_cycles SET credit_id=v_id,credit_date=v_date,credit_request=p_request.id,credit_journal=v_journal WHERE id=v_cycle.id;
  RETURN jsonb_build_object('creditId',v_id,'amount',v_cycle.price::text);
 ELSE RAISE EXCEPTION 'finance workflow unavailable';
 END CASE;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_contract_invoice_credit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_cycle uuid;v_request uuid;
BEGIN
 SELECT id INTO v_cycle FROM public.finance_contract_cycles WHERE invoice_id=NEW.original_invoice_id;
 IF v_cycle IS NOT NULL THEN
  v_request:=nullif(current_setting('tapaano.finance_request',true),'')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_request AND org_id=NEW.org_id AND state='EXECUTING' AND kind='CONTRACT_CREDIT' AND payload->>'cycle_id'=v_cycle::text) THEN RAISE EXCEPTION 'contract invoice credits require the approved contract credit workflow'; END IF;
 END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS contract_invoice_credit ON public.customer_credit_notes;
CREATE TRIGGER contract_invoice_credit BEFORE INSERT ON public.customer_credit_notes FOR EACH ROW EXECUTE FUNCTION public.guard_contract_invoice_credit();

CREATE OR REPLACE FUNCTION public.assert_contract_journal(p_id uuid,p_entity uuid,p_date date,p_debit uuid,p_credit uuid,p_amount numeric)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_amount=0 AND p_id IS NULL THEN RETURN; END IF;
 IF p_amount<=0 OR p_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.journal_entries j JOIN public.accounting_events e ON e.id=j.accounting_event_id AND e.journal_entry_id=j.id
   WHERE j.id=p_id AND j.entity_id=p_entity AND j.entry_date=p_date AND j.status='posted' AND j.source_module='gl' AND j.reversed_by_id IS NULL AND e.source_type='manual_journal') OR
   (SELECT count(*) FROM public.journal_lines WHERE journal_entry_id=p_id)<>2 OR
   NOT EXISTS(SELECT 1 FROM public.journal_lines WHERE journal_entry_id=p_id AND account_id=p_debit AND debit=p_amount AND credit=0) OR
   NOT EXISTS(SELECT 1 FROM public.journal_lines WHERE journal_entry_id=p_id AND account_id=p_credit AND credit=p_amount AND debit=0) THEN RAISE EXCEPTION 'contract journal graph is invalid'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_contract_graph(p_contract uuid,p_cycle_id uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_c public.finance_contracts%ROWTYPE;v_cycle record;v_entry record;v_day record;v_revenue uuid;v_deferred uuid;v_unbilled uuid;v_total numeric;v_before numeric;v_bill numeric;v_rec numeric;v_gl_deferred numeric;v_gl_unbilled numeric;
BEGIN
 SELECT * INTO v_c FROM public.finance_contracts WHERE id=p_contract;
 IF v_c.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.entities WHERE id=v_c.entity_id AND org_id=v_c.org_id AND currency=v_c.currency) OR
  NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_c.creation_request AND org_id=v_c.org_id AND entity_id=v_c.entity_id AND kind='CONTRACT_CREATE' AND payload=v_c.terms AND state IN ('APPROVED','EXECUTING')) THEN RAISE EXCEPTION 'contract approval graph is invalid'; END IF;
 SELECT revenue_account_id INTO v_revenue FROM public.entity_invoice_account_controls WHERE entity_id=v_c.entity_id;
 v_deferred:=(v_c.terms->>'deferred_account_id')::uuid;v_unbilled:=(v_c.terms->>'unbilled_account_id')::uuid;
 FOR v_cycle IN SELECT * FROM public.finance_contract_cycles WHERE contract_id=v_c.id AND (p_cycle_id IS NULL OR id=p_cycle_id) LOOP
  IF (SELECT coalesce(sum((a->>'amount')::numeric),0) FROM jsonb_array_elements(v_cycle.allocations) a)<>v_cycle.price THEN RAISE EXCEPTION 'contract obligation allocations do not equal the cycle price'; END IF;
  SELECT coalesce(sum(amount),0) INTO v_total FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id;
  IF v_total>v_cycle.price THEN RAISE EXCEPTION 'contract revenue exceeds the transaction price'; END IF;
  IF v_c.terms->>'kind'='USAGE' AND v_cycle.usage_finalized AND (
    (public.contract_usage_snapshot(v_cycle.id)->>'revision') IS DISTINCT FROM v_cycle.usage_revision OR
    (public.contract_usage_snapshot(v_cycle.id)->>'units')::numeric IS DISTINCT FROM v_cycle.usage_units OR
    v_cycle.price<>round(v_cycle.usage_units*(v_c.terms->>'unit_price')::numeric,2)) THEN RAISE EXCEPTION 'finalized usage graph is invalid'; END IF;
  IF v_cycle.invoice_id IS NOT NULL THEN
   PERFORM public.validate_customer_invoice_graph(v_cycle.invoice_id);
   IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=v_cycle.invoice_id AND org_id=v_c.org_id AND entity_id=v_c.entity_id AND customer_id=v_c.customer_id AND total=v_cycle.price AND issue_date=v_cycle.invoice_date) THEN RAISE EXCEPTION 'contract invoice graph is invalid'; END IF;
   PERFORM public.assert_contract_journal(v_cycle.deferral_journal,v_c.entity_id,v_cycle.invoice_date,v_revenue,v_deferred,v_cycle.price);
   -- Dated control balances below independently verify the amount transferred.
   IF v_cycle.unbilled_transfer_journal IS NOT NULL THEN
    SELECT debit INTO v_before FROM public.journal_lines WHERE journal_entry_id=v_cycle.unbilled_transfer_journal AND account_id=v_deferred;
    PERFORM public.assert_contract_journal(v_cycle.unbilled_transfer_journal,v_c.entity_id,v_cycle.invoice_date,v_deferred,v_unbilled,v_before);
   END IF;
  END IF;
  FOR v_entry IN SELECT * FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id LOOP
   IF v_entry.transfer_journal IS NOT NULL AND (v_cycle.invoice_id IS NULL OR v_cycle.invoice_date<=v_entry.as_of) THEN RAISE EXCEPTION 'invalid contract journal transfer timing'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_entry.request_id AND org_id=v_c.org_id AND kind='CONTRACT_RECOGNIZE' AND payload->>'cycle_id'=v_cycle.id::text AND state IN ('APPROVED','EXECUTING')) OR
    (SELECT sum((a->>'amount')::numeric) FROM jsonb_array_elements(v_entry.allocations) a) IS DISTINCT FROM v_entry.amount THEN RAISE EXCEPTION 'contract revenue approval or allocation graph is invalid'; END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_entry.allocations) a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_cycle.allocations) o WHERE o->>'key'=a->>'key') OR (a->>'amount')::numeric<0) OR
    EXISTS(SELECT 1 FROM jsonb_array_elements(public.contract_earned(v_cycle.id,v_entry.as_of,v_entry.evidence)) earned WHERE (earned->>'amount')::numeric <
     (SELECT coalesce(sum((a->>'amount')::numeric),0) FROM public.finance_revenue_entries e CROSS JOIN LATERAL jsonb_array_elements(e.allocations) a WHERE e.cycle_id=v_cycle.id AND e.as_of<=v_entry.as_of AND a->>'key'=earned->>'key')) THEN RAISE EXCEPTION 'recognized revenue exceeds earned performance obligations'; END IF;
   -- The debit account on the immutable recognition entry identifies whether the
   -- cycle was invoiced when that recognition was approved.
   IF EXISTS(SELECT 1 FROM public.journal_lines WHERE journal_entry_id=v_entry.journal_id AND account_id=v_unbilled AND debit=v_entry.amount) THEN
    PERFORM public.assert_contract_journal(v_entry.journal_id,v_c.entity_id,v_entry.as_of,v_unbilled,v_revenue,v_entry.amount);
    IF v_entry.transfer_journal IS NOT NULL THEN PERFORM public.assert_contract_journal(v_entry.transfer_journal,v_c.entity_id,v_cycle.invoice_date,v_deferred,v_unbilled,v_entry.amount); END IF;
   ELSE PERFORM public.assert_contract_journal(v_entry.journal_id,v_c.entity_id,v_entry.as_of,v_deferred,v_revenue,v_entry.amount);
   END IF;
  END LOOP;
  IF v_cycle.credit_id IS NOT NULL THEN
   PERFORM public.validate_customer_credit_note_graph(v_cycle.credit_id);
   IF NOT EXISTS(SELECT 1 FROM public.customer_credit_notes WHERE id=v_cycle.credit_id AND original_invoice_id=v_cycle.invoice_id AND issue_date=v_cycle.credit_date) THEN RAISE EXCEPTION 'contract credit graph is invalid'; END IF;
   PERFORM public.assert_contract_journal(v_cycle.credit_journal,v_c.entity_id,v_cycle.credit_date,v_deferred,v_revenue,v_cycle.price-v_total);
  END IF;
  FOR v_day IN SELECT invoice_date AS day FROM public.finance_contract_cycles WHERE id=v_cycle.id AND invoice_date IS NOT NULL
    UNION SELECT credit_date FROM public.finance_contract_cycles WHERE id=v_cycle.id AND credit_date IS NOT NULL
    UNION SELECT as_of FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id LOOP
   SELECT coalesce(sum(amount),0) INTO v_rec FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id AND as_of<=v_day.day;
   v_bill:=CASE WHEN v_cycle.invoice_id IS NOT NULL AND v_cycle.invoice_date<=v_day.day THEN v_cycle.price ELSE 0 END;
   IF v_cycle.credit_date<=v_day.day THEN v_rec:=0;v_bill:=0; END IF;
   SELECT coalesce(sum(l.credit-l.debit) FILTER(WHERE l.account_id=v_deferred),0),coalesce(sum(l.debit-l.credit) FILTER(WHERE l.account_id=v_unbilled),0)
    INTO v_gl_deferred,v_gl_unbilled FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id
    WHERE j.entry_date<=v_day.day AND j.id IN (SELECT unnest(ARRAY[v_cycle.deferral_journal,v_cycle.unbilled_transfer_journal,v_cycle.credit_journal])
       UNION SELECT journal_id FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id UNION SELECT transfer_journal FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id);
   IF v_gl_deferred<>greatest(v_bill-v_rec,0) OR v_gl_unbilled<>greatest(v_rec-v_bill,0) THEN RAISE EXCEPTION 'dated contract balances do not reconcile to their journals'; END IF;
  END LOOP;
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.check_contract_graph_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_contract uuid;v_cycle uuid;
BEGIN
 IF TG_TABLE_NAME='finance_contracts' THEN
  v_contract:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 ELSIF TG_TABLE_NAME='finance_contract_cycles' THEN
  v_contract:=CASE WHEN TG_OP='DELETE' THEN OLD.contract_id ELSE NEW.contract_id END;
  v_cycle:=CASE WHEN TG_OP='DELETE' THEN OLD.id ELSE NEW.id END;
 ELSE
  v_cycle:=CASE WHEN TG_OP='DELETE' THEN OLD.cycle_id ELSE NEW.cycle_id END;
  SELECT contract_id INTO v_contract FROM public.finance_contract_cycles WHERE id=v_cycle;
 END IF;
 IF v_contract IS NOT NULL THEN PERFORM public.validate_contract_graph(v_contract,v_cycle); END IF;
 RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_contract_journal_reversal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.reversal_of_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE NEW.reversal_of_id IN (deferral_journal,unbilled_transfer_journal,credit_journal)) OR
  EXISTS(SELECT 1 FROM public.finance_revenue_entries WHERE NEW.reversal_of_id IN (journal_id,transfer_journal))) THEN RAISE EXCEPTION 'contract journals must be corrected through the contract workflow'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS contract_journal_reversal ON public.journal_entries;
CREATE TRIGGER contract_journal_reversal BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_contract_journal_reversal();

CREATE OR REPLACE FUNCTION public.get_contract_control_balances(p_entity_id uuid,p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_result jsonb;v_contract record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity_id AND org_id=v_org) OR p_as_of IS NULL OR p_as_of NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' THEN RAISE EXCEPTION 'contract control scope unavailable'; END IF;
 PERFORM public.get_entity_trial_balance(p_entity_id,DATE '0001-01-01',p_as_of);
 FOR v_contract IN SELECT id FROM public.finance_contracts WHERE entity_id=p_entity_id AND org_id=v_org LOOP PERFORM public.validate_contract_graph(v_contract.id); END LOOP;
 WITH cycles AS (
  SELECT c.terms,s.*,CASE WHEN s.credit_date<=p_as_of THEN 0 ELSE coalesce((SELECT sum(amount) FROM public.finance_revenue_entries WHERE cycle_id=s.id AND as_of<=p_as_of),0) END AS earned,
   CASE WHEN s.credit_date<=p_as_of THEN 0 WHEN s.invoice_id IS NOT NULL AND s.invoice_date<=p_as_of THEN s.price ELSE 0 END AS billed
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
  v_billed:=v_billed+v_b;v_recognized:=v_recognized+v_r;v_deferred:=v_deferred+greatest(v_b-v_r,0);v_unbilled:=v_unbilled+greatest(v_r-v_b,0);
  SELECT coalesce(jsonb_agg(jsonb_build_object('through',month_end,'cumulativeEarned',CASE WHEN v_cycle.usage_finalized THEN public.contract_earned(v_cycle.id,month_end,'[]') ELSE NULL END) ORDER BY month_end),'[]') INTO v_schedule
   FROM (SELECT least((date_trunc('month',d)+INTERVAL '1 month - 1 day')::date,v_cycle.ends_on) AS month_end FROM generate_series(date_trunc('month',v_cycle.starts_on::timestamp),date_trunc('month',v_cycle.ends_on::timestamp),INTERVAL '1 month') d) m;
  v_rows:=v_rows||jsonb_build_array(jsonb_build_object('id',v_cycle.id,'number',v_cycle.cycle_number,'startsOn',v_cycle.starts_on,'endsOn',v_cycle.ends_on,'price',v_cycle.price::text,'allocations',v_cycle.allocations,
   'usageFinalized',v_cycle.usage_finalized,'usage',public.contract_usage_snapshot(v_cycle.id),'invoiceId',v_cycle.invoice_id,'invoiceDate',v_cycle.invoice_date,'billingRequest',v_cycle.billing_request,'creditId',v_cycle.credit_id,'cancelled',v_cycle.cancel_request IS NOT NULL,
   'billed',round(v_b,2)::text,'recognized',round(v_r,2)::text,'deferred',round(greatest(v_b-v_r,0),2)::text,'unbilled',round(greatest(v_r-v_b,0),2)::text,'schedule',v_schedule,
   'recognitions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'date',as_of,'amount',amount::text,'allocations',allocations,'journalId',journal_id,'evidence',evidence) ORDER BY as_of,id) FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id),'[]'::jsonb)));
 END LOOP;
 RETURN jsonb_build_object('id',v_c.id,'reference',v_c.reference,'entityId',v_c.entity_id,'customerId',v_c.customer_id,'currency',v_c.currency,'terms',v_c.terms,'asOf',p_as_of,'billed',round(v_billed,2)::text,'recognized',round(v_recognized,2)::text,'deferred',round(v_deferred,2)::text,'unbilled',round(v_unbilled,2)::text,'cycles',v_rows,'controls',public.get_contract_control_balances(v_c.entity_id,p_as_of));
END; $$;

DO $$ DECLARE t text;f record;
BEGIN
 FOREACH t IN ARRAY ARRAY['finance_contracts','finance_contract_cycles','finance_usage_events','finance_revenue_entries','finance_contract_amendments'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(org_id=public.get_user_org_id())',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);
  EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);
  EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
  IF t<>'finance_contract_amendments' THEN
   EXECUTE format('DROP TRIGGER IF EXISTS contract_graph ON public.%I',t);
   EXECUTE format('CREATE CONSTRAINT TRIGGER contract_graph AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_contract_graph_trigger()',t);
  END IF;
 END LOOP;
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
  ('allocate_contract_price','record_contract_usage','contract_usage_snapshot','contract_earned','validate_finance_extension','execute_finance_extension','post_contract_transfer','guard_contract_invoice_credit','get_contract_finance','get_contract_control_balances','assert_contract_journal','validate_contract_graph','guard_contract_journal_reversal','check_contract_graph_trigger') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname IN ('record_contract_usage','get_contract_finance','get_contract_control_balances') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END; $$;
COMMIT;
