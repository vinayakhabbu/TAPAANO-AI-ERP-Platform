BEGIN;
LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF to_regprocedure('public.validate_customer_extension(uuid,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.validate_finance_extension(uuid,text,jsonb) RENAME TO validate_customer_extension;
  ALTER FUNCTION public.execute_finance_extension(public.finance_requests) RENAME TO execute_customer_extension;
  ALTER FUNCTION public.finance_source_snapshot(uuid,text,jsonb) RENAME TO customer_source_snapshot;
  ALTER FUNCTION public.customer_credit_preview(uuid,jsonb) RENAME TO concession_credit_preview;
  ALTER FUNCTION public.get_customer_adjustments(uuid,date) RENAME TO pre_subscription_customer_adjustments;
 END IF;
END; $$;
CREATE TABLE IF NOT EXISTS public.finance_subscription_changes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,contract_id uuid NOT NULL,
 cycle_id uuid,action text NOT NULL CHECK(action IN ('CHANGE','CANCEL','RENEW')),effective_on date NOT NULL,
 replacement_id uuid,credit_id uuid,cancelled_cycles uuid[] NOT NULL,request_id uuid NOT NULL,
 reversal_request uuid,reversal_date date,
 UNIQUE(org_id,id),UNIQUE(request_id),UNIQUE(replacement_id),UNIQUE(credit_id),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),FOREIGN KEY(org_id,contract_id) REFERENCES public.finance_contracts(org_id,id),
 FOREIGN KEY(org_id,cycle_id) REFERENCES public.finance_contract_cycles(org_id,id),FOREIGN KEY(org_id,replacement_id) REFERENCES public.finance_contracts(org_id,id),
 FOREIGN KEY(org_id,credit_id) REFERENCES public.finance_customer_credits(org_id,id),FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,reversal_request) REFERENCES public.finance_requests(org_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_subscription_active_change ON public.finance_subscription_changes(contract_id) WHERE reversal_request IS NULL;
CREATE TABLE IF NOT EXISTS public.finance_subscription_actions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,parent_request uuid NOT NULL,child_request uuid NOT NULL,
 slot text NOT NULL CHECK(slot IN ('EARNED','UNUSED','REPLACEMENT','RENEWAL','RESTORE_CREDIT')),
 UNIQUE(org_id,id),UNIQUE(parent_request,slot),UNIQUE(child_request),
 FOREIGN KEY(org_id,parent_request) REFERENCES public.finance_requests(org_id,id),FOREIGN KEY(org_id,child_request) REFERENCES public.finance_requests(org_id,id)
);

CREATE OR REPLACE FUNCTION public.subscription_cycle_price(p_unit text,p_quantity text,p_discount text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE v_unit numeric;v_discount numeric;v_net numeric;
BEGIN
 IF coalesce(p_quantity,'') !~ '^[1-9][0-9]{0,5}$' THEN RAISE EXCEPTION 'subscription quantity must be an integer from one to 999999'; END IF;
 v_unit:=public.cash_amount(p_unit);v_discount:=public.cash_amount(p_discount);
 IF v_unit<=0 OR v_discount<0 OR v_discount>=100 THEN RAISE EXCEPTION 'subscription unit price must be positive and discount must be below 100 percent'; END IF;
 v_net:=round(v_unit*p_quantity::numeric*(100-v_discount)/100,2);
 IF v_net<=0 OR v_net>9999999999999.99 THEN RAISE EXCEPTION 'discounted subscription cycle price is outside supported bounds'; END IF;RETURN v_net;
END; $$;
CREATE OR REPLACE FUNCTION public.assert_subscription_open(p_entity uuid,p_date date)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.accounting_periods WHERE entity_id=p_entity AND org_id=public.get_user_org_id() AND status='OPEN' AND p_date BETWEEN period_start AND period_end) OR
  EXISTS(SELECT 1 FROM public.finance_year_closes WHERE entity_id=p_entity AND active AND ends_on>=p_date) OR
  EXISTS(SELECT 1 FROM public.finance_consolidations c JOIN public.finance_groups g ON g.id=c.group_id WHERE c.active AND p_entity=ANY(g.member_ids) AND c.ends_on>=p_date) THEN RAISE EXCEPTION 'subscription change requires an open date beyond approved fiscal and group cutoffs'; END IF;
END; $$;

-- The action list is immutable proposal evidence. Only this closed set of child
-- workflows can execute, under the same requester and independent approver.
CREATE OR REPLACE FUNCTION public.execute_subscription_child(p_parent uuid,p_slot text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_parent public.finance_requests%ROWTYPE;v_child public.finance_requests%ROWTYPE;v_action jsonb;v_result jsonb;v_payload jsonb;
BEGIN
 SELECT * INTO v_parent FROM public.finance_requests WHERE id=p_parent AND org_id=public.get_user_org_id() AND state='EXECUTING' AND decided_by=auth.uid() AND requested_by<>auth.uid();
 IF v_parent.id IS NULL OR v_parent.kind NOT IN ('SUBSCRIPTION_CHANGE','SUBSCRIPTION_RENEW','SUBSCRIPTION_REVERSE') OR current_setting('tapaano.finance_request',true) IS DISTINCT FROM p_parent::text THEN RAISE EXCEPTION 'subscription child requires its executing independent parent approval'; END IF;
 SELECT a INTO v_action FROM jsonb_array_elements(v_parent.source_snapshot->'actions') a WHERE a->>'slot'=p_slot;
 IF v_action IS NULL OR NOT ((p_slot='EARNED' AND v_action->>'kind'='CONTRACT_RECOGNIZE') OR (p_slot='UNUSED' AND v_action->>'kind'='CUSTOMER_CREDIT') OR (p_slot IN ('REPLACEMENT','RENEWAL') AND v_action->>'kind'='CONTRACT_CREATE') OR (p_slot='RESTORE_CREDIT' AND v_action->>'kind'='CUSTOMER_CREDIT_REVERSE')) THEN RAISE EXCEPTION 'subscription child action is not in the approved plan'; END IF;
 PERFORM set_config('tapaano.subscription_parent',p_parent::text,true);
 v_payload:=public.validate_finance_request(v_parent.entity_id,v_action->>'kind',v_action->'payload');
 INSERT INTO public.finance_requests(org_id,entity_id,kind,payload,source_snapshot,reason,request_key,requested_by,state,decided_by)
  VALUES(v_parent.org_id,v_parent.entity_id,v_action->>'kind',v_payload,public.finance_source_snapshot(v_parent.entity_id,v_action->>'kind',v_payload),v_parent.reason,'subscription:'||p_parent||':'||p_slot,v_parent.requested_by,'EXECUTING',v_parent.decided_by) RETURNING * INTO v_child;
 PERFORM set_config('tapaano.finance_request',v_child.id::text,true);
 v_result:=public.execute_finance_extension(v_child);
 UPDATE public.finance_requests SET state='APPROVED',result=v_result,decided_at=now(),decision_reason='Executed under approved subscription action '||p_parent WHERE id=v_child.id;
 INSERT INTO public.finance_subscription_actions(org_id,parent_request,child_request,slot) VALUES(v_parent.org_id,p_parent,v_child.id,p_slot);
 PERFORM set_config('tapaano.finance_request',p_parent::text,true);PERFORM set_config('tapaano.subscription_parent','',true);
 RETURN v_result;
END; $$;
CREATE OR REPLACE FUNCTION public.require_subscription_child(p_kind text,p_payload jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.finance_requests r CROSS JOIN LATERAL jsonb_array_elements(r.source_snapshot->'actions') a WHERE r.id=nullif(current_setting('tapaano.subscription_parent',true),'')::uuid AND r.org_id=public.get_user_org_id() AND r.state='EXECUTING' AND r.decided_by=auth.uid() AND r.requested_by<>auth.uid() AND a->>'kind'=p_kind AND a->'payload'=p_payload) THEN RAISE EXCEPTION 'unused subscription credits require the approved subscription action'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.customer_credit_preview(p_entity uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_preview jsonb;v_cycle public.finance_contract_cycles%ROWTYPE;v_c public.finance_contracts%ROWTYPE;v_credit numeric;v_lines jsonb:='[]';v_ar uuid;v_liability uuid;
BEGIN
 v_preview:=public.concession_credit_preview(p_entity,p_payload-ARRAY['mode','service_cutoff']);
 IF NOT (p_payload ? 'mode') THEN RETURN v_preview; END IF;
 IF p_payload->>'mode'<>'UNUSED_SERVICE' OR (p_payload->>'service_cutoff')::date<>(p_payload->>'date')::date THEN RAISE EXCEPTION 'invalid unused service credit'; END IF;
 SELECT * INTO v_cycle FROM public.finance_contract_cycles WHERE invoice_id=(p_payload->>'invoice_id')::uuid;
 SELECT * INTO v_c FROM public.finance_contracts WHERE id=v_cycle.contract_id;
 IF v_c.terms->>'kind' IS DISTINCT FROM 'FIXED' OR jsonb_array_length(v_cycle.allocations)<>1 OR v_cycle.allocations->0->>'method'<>'DAILY' THEN RAISE EXCEPTION 'unused service credit requires one daily subscription obligation'; END IF;
 v_credit:=(v_preview->>'amount')::numeric;
 v_lines:=jsonb_build_array(jsonb_build_object('account_id',v_c.terms->>'deferred_account_id','debit',round(v_credit,2)::text,'credit','0.00'));
 SELECT ar_account_id INTO v_ar FROM public.entity_invoice_account_controls WHERE entity_id=p_entity;
 SELECT liability_account_id INTO v_liability FROM public.finance_customer_credit_controls WHERE id=(v_preview->>'controlId')::uuid;
 IF (v_preview->>'arAmount')::numeric>0 THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',v_ar,'debit','0.00','credit',v_preview->>'arAmount')); END IF;
 IF (v_preview->>'balanceAmount')::numeric>0 THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',v_liability,'debit','0.00','credit',v_preview->>'balanceAmount')); END IF;
 RETURN v_preview||jsonb_build_object('obligations',jsonb_build_array(jsonb_build_object('key',v_cycle.allocations->0->>'key','amount',round(v_credit,2)::text,'recognized','0.00')),'journalLines',v_lines);
END; $$;
CREATE OR REPLACE FUNCTION public.contract_earned(p_cycle_id uuid,p_as_of date,p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb:='[]';v_o jsonb;v_price numeric;v_reduction numeric;v_recognized numeric;v_unused numeric;v_stop date;
BEGIN
 SELECT min((r.payload->>'service_cutoff')::date)-1 INTO v_stop FROM public.finance_customer_credits c JOIN public.finance_requests r ON r.id=c.request_id JOIN public.finance_contract_cycles s ON s.invoice_id=c.invoice_id
  WHERE s.id=p_cycle_id AND r.payload->>'mode'='UNUSED_SERVICE' AND c.as_of<=p_as_of AND (c.reversal_date IS NULL OR c.reversal_date>p_as_of);
 FOR v_o IN SELECT value FROM jsonb_array_elements(public.original_contract_earned(p_cycle_id,least(p_as_of,coalesce(v_stop,p_as_of)),p_evidence)) LOOP
  SELECT (a->>'amount')::numeric INTO v_price FROM public.finance_contract_cycles s CROSS JOIN LATERAL jsonb_array_elements(s.allocations) a WHERE s.id=p_cycle_id AND a->>'key'=v_o->>'key';
  SELECT coalesce(sum((a->>'amount')::numeric) FILTER(WHERE r.payload->>'mode' IS DISTINCT FROM 'UNUSED_SERVICE'),0),coalesce(sum((a->>'recognized')::numeric),0),coalesce(sum((a->>'amount')::numeric) FILTER(WHERE r.payload->>'mode'='UNUSED_SERVICE'),0)
   INTO v_reduction,v_recognized,v_unused FROM public.finance_customer_credits c JOIN public.finance_requests r ON r.id=c.request_id JOIN public.finance_contract_cycles s ON s.invoice_id=c.invoice_id CROSS JOIN LATERAL jsonb_array_elements(c.obligations) a
   WHERE s.id=p_cycle_id AND a->>'key'=v_o->>'key' AND c.as_of<=p_as_of AND (c.reversal_date IS NULL OR c.reversal_date>p_as_of);
  v_price:=v_price-v_unused;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('key',v_o->>'key','amount',round((v_o->>'amount')::numeric-CASE WHEN v_price=0 THEN 0 ELSE round((v_o->>'amount')::numeric*v_reduction/v_price,2) END+v_recognized,2)::text));
 END LOOP;RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.subscription_plan(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_c public.finance_contracts%ROWTYPE;v_cycle public.finance_contract_cycles%ROWTYPE;v_change public.finance_subscription_changes%ROWTYPE;
 v_date date;v_end date;v_anchor date;v_offset integer;v_months integer;v_price numeric;v_earned numeric;v_recognized numeric;v_unused numeric;v_terms jsonb;v_actions jsonb:='[]';v_payload jsonb;v_preview jsonb;v_cancel uuid[];v_history jsonb;
BEGIN
 PERFORM public.assert_accounting_actor(v_org);
 IF p_kind='SUBSCRIPTION_REVERSE' THEN
  IF p_payload-ARRAY['change_id','date']<>'{}'::jsonb OR coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'subscription correction identity and date required'; END IF;
  SELECT * INTO v_change FROM public.finance_subscription_changes WHERE id=(p_payload->>'change_id')::uuid AND org_id=v_org AND entity_id=p_entity;
  IF v_change.id IS NULL OR v_change.reversal_request IS NOT NULL OR (p_payload->>'date')::date<>v_change.effective_on THEN RAISE EXCEPTION 'correct a subscription change on its original open effective date'; END IF;
  PERFORM public.assert_subscription_open(p_entity,v_change.effective_on);
  IF v_change.replacement_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE contract_id=v_change.replacement_id AND (billing_request IS NOT NULL OR cancel_request IS NOT NULL OR finalization_request IS NOT NULL)) OR EXISTS(SELECT 1 FROM public.finance_revenue_entries e JOIN public.finance_contract_cycles s ON s.id=e.cycle_id WHERE s.contract_id=v_change.replacement_id) OR EXISTS(SELECT 1 FROM public.finance_subscription_changes WHERE contract_id=v_change.replacement_id)) THEN RAISE EXCEPTION 'replacement subscription has activity; use a subsequent prospective change'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE id=ANY(v_change.cancelled_cycles) AND cancel_request IS DISTINCT FROM v_change.request_id) THEN RAISE EXCEPTION 'cancelled subscription source changed'; END IF;
  IF v_change.credit_id IS NOT NULL THEN v_actions:=jsonb_build_array(jsonb_build_object('slot','RESTORE_CREDIT','kind','CUSTOMER_CREDIT_REVERSE','payload',jsonb_build_object('credit_id',v_change.credit_id,'date',v_change.effective_on)));END IF;
  RETURN jsonb_build_object('change',to_jsonb(v_change),'actions',v_actions,'creditState',(SELECT to_jsonb(c) FROM public.finance_customer_credits c WHERE id=v_change.credit_id),'uses',coalesce((SELECT jsonb_agg(to_jsonb(u) ORDER BY u.id) FROM public.finance_customer_credit_uses u WHERE u.credit_id=v_change.credit_id),'[]'));
 END IF;
 IF p_kind NOT IN ('SUBSCRIPTION_CHANGE','SUBSCRIPTION_RENEW') OR p_payload-ARRAY['contract_id','action','effective_on','reference','credit_reference','unit_price','quantity','discount_percent','ends_on']<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid subscription change fields'; END IF;
 SELECT * INTO v_c FROM public.finance_contracts WHERE id=(p_payload->>'contract_id')::uuid AND org_id=v_org AND entity_id=p_entity;
 IF v_c.id IS NULL OR v_c.terms->>'kind'<>'FIXED' OR v_c.terms->>'cycle_months' NOT IN ('1','3','12') OR jsonb_array_length(v_c.terms->'obligations')<>1 OR v_c.terms->'obligations'->0->>'method'<>'DAILY' THEN RAISE EXCEPTION 'subscription changes require a recurring fixed contract with one daily service obligation'; END IF;
 PERFORM public.validate_contract_graph(v_c.id);
 IF EXISTS(SELECT 1 FROM public.finance_subscription_changes WHERE contract_id=v_c.id AND reversal_request IS NULL) THEN RAISE EXCEPTION 'subscription already changed or renewed; select its current replacement term'; END IF;
 IF EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE contract_id=v_c.id AND cancel_request IS NOT NULL) THEN RAISE EXCEPTION 'resolve previously cancelled subscription cycles before changing the term'; END IF;
 v_months:=(v_c.terms->>'cycle_months')::int;
 SELECT jsonb_agg(jsonb_build_object('cycle',to_jsonb(s)||jsonb_build_object('price',s.price::text,'usage_units',s.usage_units::text),'recognitions',coalesce((SELECT jsonb_agg(to_jsonb(r)||jsonb_build_object('amount',r.amount::text) ORDER BY r.id) FROM public.finance_revenue_entries r WHERE r.cycle_id=s.id),'[]'),'invoiceRemaining',public.customer_invoice_remaining(s.invoice_id,CURRENT_DATE)) ORDER BY s.cycle_number) INTO v_history FROM public.finance_contract_cycles s WHERE s.contract_id=v_c.id;
 IF p_kind='SUBSCRIPTION_RENEW' THEN
  IF p_payload ? 'effective_on' OR p_payload ? 'credit_reference' OR p_payload ? 'action' OR coalesce(p_payload->>'ends_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'renewal uses the day after the current term and an explicit new end date'; END IF;
  v_date:=(v_c.terms->>'ends_on')::date+1;v_end:=(p_payload->>'ends_on')::date;v_anchor:=v_date;v_offset:=0;v_cancel:='{}';
 ELSE
  IF p_payload ? 'ends_on' OR coalesce(p_payload->>'action','') NOT IN ('CHANGE','CANCEL') OR coalesce(p_payload->>'effective_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'subscription action and effective service date required'; END IF;
  v_date:=(p_payload->>'effective_on')::date;
  IF v_date>CURRENT_DATE THEN RAISE EXCEPTION 'execute subscription changes on or after their effective service date'; END IF;
  PERFORM public.assert_subscription_open(p_entity,v_date);
  SELECT * INTO v_cycle FROM public.finance_contract_cycles WHERE contract_id=v_c.id AND v_date BETWEEN starts_on AND ends_on;
  IF v_cycle.id IS NULL OR v_cycle.billing_request IS NULL OR (v_cycle.price>0 AND v_cycle.invoice_id IS NULL) OR v_cycle.credit_id IS NOT NULL THEN RAISE EXCEPTION 'subscription change requires a billed current cycle; use prospective amendments for untouched future cycles'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_customer_credits WHERE invoice_id=v_cycle.invoice_id AND reversal_date IS NULL) THEN RAISE EXCEPTION 'resolve existing price concessions before changing remaining subscription service'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_contract_cycles s WHERE s.contract_id=v_c.id AND s.cycle_number>v_cycle.cycle_number AND (s.billing_request IS NOT NULL OR s.finalization_request IS NOT NULL OR EXISTS(SELECT 1 FROM public.finance_revenue_entries WHERE cycle_id=s.id) OR EXISTS(SELECT 1 FROM public.finance_usage_events WHERE cycle_id=s.id))) THEN RAISE EXCEPTION 'future subscription cycles already have accounting activity'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id AND as_of>=v_date) THEN RAISE EXCEPTION 'subscription effective date must follow recognized service history'; END IF;
  v_earned:=(public.original_contract_earned(v_cycle.id,v_date-1,'[]')->0->>'amount')::numeric;
  SELECT coalesce(sum(amount),0) INTO v_recognized FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id;
  IF v_earned<v_recognized THEN RAISE EXCEPTION 'subscription recognition exceeds service before the change'; END IF;
  IF v_earned>v_recognized THEN v_actions:=v_actions||jsonb_build_array(jsonb_build_object('slot','EARNED','kind','CONTRACT_RECOGNIZE','payload',jsonb_build_object('cycle_id',v_cycle.id,'as_of',v_date-1,'evidence','[]'::jsonb)));END IF;
  v_unused:=v_cycle.price-v_earned;
  IF v_unused>0 THEN
   v_payload:=jsonb_build_object('invoice_id',v_cycle.invoice_id,'reference',p_payload->>'credit_reference','date',v_date,'mode','UNUSED_SERVICE','service_cutoff',v_date,'lines',jsonb_build_array(jsonb_build_object('line_id',(SELECT id FROM public.invoice_lines WHERE invoice_id=v_cycle.invoice_id),'amount',round(v_unused,2)::text)));
   IF length(coalesce(v_payload->>'reference','')) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'unused service credit reference required'; END IF;
   v_preview:=public.customer_credit_preview(p_entity,v_payload);
   v_actions:=v_actions||jsonb_build_array(jsonb_build_object('slot','UNUSED','kind','CUSTOMER_CREDIT','payload',v_payload));
  END IF;
  SELECT array_agg(id ORDER BY cycle_number) INTO v_cancel FROM public.finance_contract_cycles WHERE contract_id=v_c.id AND cycle_number>=v_cycle.cycle_number;
  v_anchor:=coalesce((v_c.terms->>'billing_anchor')::date,(v_c.terms->>'starts_on')::date);v_offset:=coalesce((v_c.terms->>'billing_offset')::int,0)+v_cycle.cycle_number-1;v_end:=(v_c.terms->>'ends_on')::date;
 END IF;
 IF p_kind='SUBSCRIPTION_RENEW' OR p_payload->>'action'='CHANGE' THEN
  IF jsonb_typeof(p_payload->'unit_price') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload->'discount_percent') IS DISTINCT FROM 'string' OR length(coalesce(p_payload->>'reference','')) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'replacement reference, exact unit price and discount required'; END IF;
  v_price:=public.subscription_cycle_price(p_payload->>'unit_price',p_payload->>'quantity',p_payload->>'discount_percent');
  v_terms:=(v_c.terms-ARRAY['reference','starts_on','ends_on','price','billing_anchor','billing_offset','pricing'])||jsonb_build_object('reference',p_payload->>'reference','starts_on',v_date,'ends_on',v_end,'price',round(v_price,2)::text,'billing_anchor',v_anchor,'billing_offset',v_offset,'pricing',jsonb_build_object('unit_price',p_payload->>'unit_price','quantity',p_payload->>'quantity','discount_percent',p_payload->>'discount_percent'));
  PERFORM public.validate_finance_request(p_entity,'CONTRACT_CREATE',v_terms);
  v_actions:=v_actions||jsonb_build_array(jsonb_build_object('slot',CASE WHEN p_kind='SUBSCRIPTION_RENEW' THEN 'RENEWAL' ELSE 'REPLACEMENT' END,'kind','CONTRACT_CREATE','payload',v_terms));
 END IF;
 RETURN jsonb_build_object('contractId',v_c.id,'reference',v_c.reference,'cycleId',v_cycle.id,'effectiveOn',v_date,'action',CASE WHEN p_kind='SUBSCRIPTION_RENEW' THEN 'RENEW' ELSE p_payload->>'action' END,'earnedBeforeChange',round(coalesce(v_earned,0),2)::text,'catchUpRecognition',round(coalesce(v_earned-v_recognized,0),2)::text,'unusedCredit',round(coalesce(v_unused,0),2)::text,'creditPreview',v_preview,'replacementTerms',v_terms,'cancelledCycles',to_jsonb(v_cancel),'actions',v_actions,'history',v_history);
END; $$;

CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_anchor date;v_start date;v_months integer;v_offset integer;v_price numeric;
BEGIN
 IF p_kind IN ('SUBSCRIPTION_CHANGE','SUBSCRIPTION_RENEW','SUBSCRIPTION_REVERSE') THEN PERFORM public.subscription_plan(p_entity,p_kind,p_payload);RETURN p_payload;END IF;
 IF p_kind='CUSTOMER_CREDIT' AND p_payload ? 'mode' THEN
  PERFORM public.require_subscription_child(p_kind,p_payload);
  PERFORM public.validate_customer_extension(p_entity,p_kind,p_payload-ARRAY['mode','service_cutoff']);
  PERFORM public.customer_credit_preview(p_entity,p_payload);RETURN p_payload;
 END IF;
 IF p_kind='CUSTOMER_CREDIT_REVERSE' AND EXISTS(SELECT 1 FROM public.finance_customer_credits c JOIN public.finance_requests r ON r.id=c.request_id WHERE c.id=(p_payload->>'credit_id')::uuid AND r.payload->>'mode'='UNUSED_SERVICE') THEN PERFORM public.require_subscription_child(p_kind,p_payload);END IF;
 IF p_kind='CONTRACT_CREATE' AND (p_payload ? 'billing_anchor' OR p_payload ? 'billing_offset' OR p_payload ? 'pricing') THEN
  PERFORM public.validate_customer_extension(p_entity,p_kind,p_payload-ARRAY['billing_anchor','billing_offset','pricing']);
  IF p_payload->>'kind'<>'FIXED' OR coalesce(p_payload->>'cycle_months','') NOT IN ('1','3','12') OR coalesce(p_payload->>'billing_anchor','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_payload->>'billing_offset','') !~ '^[0-9]{1,3}$' THEN RAISE EXCEPTION 'anchored subscription requires a fixed recurring cycle and original billing anchor'; END IF;
  v_anchor:=(p_payload->>'billing_anchor')::date;v_start:=(p_payload->>'starts_on')::date;v_offset:=(p_payload->>'billing_offset')::int;v_months:=(p_payload->>'cycle_months')::int;
  IF v_anchor<DATE '0001-01-01' OR v_start<(v_anchor+make_interval(months=>v_offset*v_months))::date OR v_start>=(v_anchor+make_interval(months=>(v_offset+1)*v_months))::date THEN RAISE EXCEPTION 'first subscription service date must be inside the anchored billing cycle'; END IF;
  IF p_payload ? 'pricing' THEN
   IF jsonb_typeof(p_payload->'pricing'->'unit_price') IS DISTINCT FROM 'string' OR jsonb_typeof(p_payload->'pricing'->'discount_percent') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'exact decimal subscription pricing strings required'; END IF;
   IF (p_payload->'pricing')-ARRAY['unit_price','quantity','discount_percent']<>'{}'::jsonb THEN RAISE EXCEPTION 'unknown subscription pricing fields'; END IF;
   v_price:=public.subscription_cycle_price(p_payload->'pricing'->>'unit_price',p_payload->'pricing'->>'quantity',p_payload->'pricing'->>'discount_percent');
   IF v_price<>public.cash_amount(p_payload->>'price') THEN RAISE EXCEPTION 'subscription pricing does not equal the approved net cycle price'; END IF;
  END IF;RETURN p_payload;
 END IF;
 RETURN public.validate_customer_extension(p_entity,p_kind,p_payload);
END; $$;
CREATE OR REPLACE FUNCTION public.finance_source_snapshot(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_kind IN ('SUBSCRIPTION_CHANGE','SUBSCRIPTION_RENEW','SUBSCRIPTION_REVERSE') THEN RETURN public.subscription_plan(p_entity,p_kind,p_payload);END IF;
 RETURN public.customer_source_snapshot(p_entity,p_kind,p_payload);
END; $$;

CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p jsonb:=p_request.payload;v_plan jsonb:=p_request.source_snapshot;v_c public.finance_contracts%ROWTYPE;v_change public.finance_subscription_changes%ROWTYPE;
 v_start date;v_period_start date;v_next date;v_end date;v_anchor date;v_n integer:=0;v_months integer;v_offset integer;v_price numeric;v_currency text;v_result jsonb;v_new uuid;v_credit uuid;v_id uuid;v_action jsonb;
BEGIN
 IF p_request.kind='CONTRACT_CREATE' AND v_p ? 'billing_anchor' THEN
  SELECT currency INTO v_currency FROM public.entities WHERE id=p_request.entity_id;
  INSERT INTO public.finance_contracts(org_id,entity_id,customer_id,reference,currency,terms,creation_request) VALUES(p_request.org_id,p_request.entity_id,(v_p->>'customer_id')::uuid,v_p->>'reference',v_currency,v_p,p_request.id) RETURNING * INTO v_c;
  v_start:=(v_p->>'starts_on')::date;v_anchor:=(v_p->>'billing_anchor')::date;v_offset:=(v_p->>'billing_offset')::int;v_months:=(v_p->>'cycle_months')::int;
  LOOP
   EXIT WHEN v_start>(v_p->>'ends_on')::date;
   v_period_start:=(v_anchor+make_interval(months=>(v_offset+v_n)*v_months))::date;v_next:=(v_anchor+make_interval(months=>(v_offset+v_n+1)*v_months))::date;v_end:=least(v_next-1,(v_p->>'ends_on')::date);
   v_price:=round(public.cash_amount(v_p->>'price')*(v_end-v_start+1)::numeric/(v_next-v_period_start),2);
   INSERT INTO public.finance_contract_cycles(org_id,contract_id,cycle_number,starts_on,ends_on,price,allocations,usage_finalized) VALUES(p_request.org_id,v_c.id,v_n+1,v_start,v_end,v_price,public.allocate_contract_price(v_price,v_p->'obligations'),true);
   v_n:=v_n+1;v_start:=v_next;
  END LOOP;RETURN jsonb_build_object('contractId',v_c.id,'cycles',v_n);
 END IF;
 IF p_request.kind NOT IN ('SUBSCRIPTION_CHANGE','SUBSCRIPTION_RENEW','SUBSCRIPTION_REVERSE') THEN RETURN public.execute_customer_extension(p_request); END IF;
 IF p_request.kind='SUBSCRIPTION_REVERSE' THEN
  SELECT * INTO v_change FROM public.finance_subscription_changes WHERE id=(v_p->>'change_id')::uuid;
  IF v_change.credit_id IS NOT NULL THEN PERFORM public.execute_subscription_child(p_request.id,'RESTORE_CREDIT');END IF;
  IF v_change.replacement_id IS NOT NULL THEN UPDATE public.finance_contract_cycles SET cancel_request=p_request.id WHERE contract_id=v_change.replacement_id;END IF;
  UPDATE public.finance_contract_cycles SET cancel_request=NULL WHERE id=ANY(v_change.cancelled_cycles);
  UPDATE public.finance_subscription_changes SET reversal_request=p_request.id,reversal_date=(v_p->>'date')::date WHERE id=v_change.id;
  RETURN jsonb_build_object('changeId',v_change.id,'restoredContractId',v_change.contract_id);
 END IF;
 FOR v_action IN SELECT a FROM jsonb_array_elements(v_plan->'actions') a LOOP
  v_result:=public.execute_subscription_child(p_request.id,v_action->>'slot');
  IF v_action->>'slot'='UNUSED' THEN v_credit:=(v_result->>'creditId')::uuid;
  ELSIF v_action->>'slot' IN ('REPLACEMENT','RENEWAL') THEN v_new:=(v_result->>'contractId')::uuid;END IF;
 END LOOP;
 UPDATE public.finance_contract_cycles SET cancel_request=p_request.id WHERE id=ANY(ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(v_plan->'cancelledCycles')));
 INSERT INTO public.finance_subscription_changes(org_id,entity_id,contract_id,cycle_id,action,effective_on,replacement_id,credit_id,cancelled_cycles,request_id)
  VALUES(p_request.org_id,p_request.entity_id,(v_plan->>'contractId')::uuid,(v_plan->>'cycleId')::uuid,v_plan->>'action',(v_plan->>'effectiveOn')::date,v_new,v_credit,ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(v_plan->'cancelledCycles')),p_request.id) RETURNING id INTO v_id;
 RETURN jsonb_build_object('changeId',v_id,'contractId',v_plan->>'contractId','replacementId',v_new,'creditId',v_credit,'unusedCredit',v_plan->>'unusedCredit','catchUpRecognition',v_plan->>'catchUpRecognition');
END; $$;

CREATE OR REPLACE FUNCTION public.validate_subscription_action_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_a public.finance_subscription_actions%ROWTYPE;v_p public.finance_requests%ROWTYPE;v_c public.finance_requests%ROWTYPE;
BEGIN
 SELECT * INTO v_a FROM public.finance_subscription_actions WHERE id=p_id;SELECT * INTO v_p FROM public.finance_requests WHERE id=v_a.parent_request;SELECT * INTO v_c FROM public.finance_requests WHERE id=v_a.child_request;
 IF v_a.id IS NULL OR v_p.org_id IS DISTINCT FROM v_a.org_id OR v_c.org_id IS DISTINCT FROM v_a.org_id OR v_p.entity_id IS DISTINCT FROM v_c.entity_id OR v_p.kind NOT IN ('SUBSCRIPTION_CHANGE','SUBSCRIPTION_RENEW','SUBSCRIPTION_REVERSE') OR v_p.state NOT IN ('APPROVED','EXECUTING') OR v_c.state<>'APPROVED' OR v_p.requested_by IS DISTINCT FROM v_c.requested_by OR v_p.decided_by IS DISTINCT FROM v_c.decided_by OR v_p.requested_by=v_p.decided_by OR
  NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_p.source_snapshot->'actions') a WHERE a->>'slot'=v_a.slot AND a->>'kind'=v_c.kind AND a->'payload'=v_c.payload) THEN RAISE EXCEPTION 'subscription child action differs from its independently approved plan'; END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.validate_subscription_change_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_s public.finance_subscription_changes%ROWTYPE;v_r public.finance_requests%ROWTYPE;v_c public.finance_contracts%ROWTYPE;v_p jsonb;v_a record;v_credit public.finance_customer_credits%ROWTYPE;
BEGIN
 SELECT * INTO v_s FROM public.finance_subscription_changes WHERE id=p_id;SELECT * INTO v_r FROM public.finance_requests WHERE id=v_s.request_id;v_p:=v_r.source_snapshot;
 SELECT * INTO v_c FROM public.finance_contracts WHERE id=v_s.contract_id;
 IF v_s.id IS NULL OR v_c.org_id IS DISTINCT FROM v_s.org_id OR v_c.entity_id IS DISTINCT FROM v_s.entity_id OR v_r.org_id IS DISTINCT FROM v_s.org_id OR v_r.entity_id IS DISTINCT FROM v_s.entity_id OR v_r.kind<>(CASE WHEN v_s.action='RENEW' THEN 'SUBSCRIPTION_RENEW' ELSE 'SUBSCRIPTION_CHANGE' END) OR v_r.state NOT IN ('APPROVED','EXECUTING') OR v_r.requested_by=v_r.decided_by OR
  (v_p->>'contractId')::uuid IS DISTINCT FROM v_s.contract_id OR (v_p->>'cycleId')::uuid IS DISTINCT FROM v_s.cycle_id OR (v_p->>'effectiveOn')::date IS DISTINCT FROM v_s.effective_on OR v_p->>'action' IS DISTINCT FROM v_s.action OR to_jsonb(v_s.cancelled_cycles) IS DISTINCT FROM v_p->'cancelledCycles' THEN RAISE EXCEPTION 'subscription change approval graph is invalid'; END IF;
 FOR v_a IN SELECT id FROM public.finance_subscription_actions WHERE parent_request=v_s.request_id LOOP PERFORM public.validate_subscription_action_graph(v_a.id);END LOOP;
 IF (SELECT count(*) FROM public.finance_subscription_actions WHERE parent_request=v_s.request_id)<>jsonb_array_length(v_p->'actions') THEN RAISE EXCEPTION 'subscription plan did not execute every approved action'; END IF;
 IF v_s.replacement_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.finance_contracts c JOIN public.finance_subscription_actions a ON a.child_request=c.creation_request WHERE c.id=v_s.replacement_id AND c.org_id=v_s.org_id AND c.entity_id=v_s.entity_id AND c.customer_id=v_c.customer_id AND c.terms=v_p->'replacementTerms' AND a.parent_request=v_s.request_id AND a.slot IN ('REPLACEMENT','RENEWAL')) THEN RAISE EXCEPTION 'replacement subscription terms differ from approved consideration'; END IF;
  PERFORM public.validate_contract_graph(v_s.replacement_id);
 END IF;
 IF v_s.credit_id IS NOT NULL THEN
  SELECT * INTO v_credit FROM public.finance_customer_credits WHERE id=v_s.credit_id;
  IF v_credit.amount IS DISTINCT FROM (v_p->>'unusedCredit')::numeric OR v_credit.as_of<>v_s.effective_on OR
   NOT EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE id=v_s.cycle_id AND invoice_id=v_credit.invoice_id) OR
   NOT EXISTS(SELECT 1 FROM public.finance_subscription_actions WHERE parent_request=v_s.request_id AND child_request=v_credit.request_id AND slot='UNUSED') THEN RAISE EXCEPTION 'subscription unused credit graph is invalid'; END IF;
  PERFORM public.validate_customer_credit_graph(v_credit.id);
 END IF;
 IF v_s.reversal_request IS NULL THEN
  IF v_s.reversal_date IS NOT NULL OR v_credit.reversal_date IS NOT NULL OR EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE id=ANY(v_s.cancelled_cycles) AND cancel_request IS DISTINCT FROM v_s.request_id) THEN RAISE EXCEPTION 'active subscription cancellation or unused credit was detached'; END IF;
 ELSE
  IF v_s.reversal_date IS DISTINCT FROM v_s.effective_on OR NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_s.reversal_request AND org_id=v_s.org_id AND entity_id=v_s.entity_id AND kind='SUBSCRIPTION_REVERSE' AND payload->>'change_id'=v_s.id::text AND (payload->>'date')::date=v_s.reversal_date AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by) THEN RAISE EXCEPTION 'subscription correction approval graph is invalid'; END IF;
  IF v_s.credit_id IS NOT NULL AND v_credit.reversal_date IS DISTINCT FROM v_s.reversal_date THEN RAISE EXCEPTION 'subscription correction did not restore its unused credit'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE contract_id=v_s.replacement_id AND cancel_request IS DISTINCT FROM v_s.reversal_request) THEN RAISE EXCEPTION 'corrected replacement subscription remains active'; END IF;
 END IF;
 PERFORM public.validate_contract_graph(v_s.contract_id);
END; $$;
CREATE OR REPLACE FUNCTION public.check_subscription_graph_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='finance_subscription_actions' THEN PERFORM public.validate_subscription_action_graph(NEW.id);ELSE PERFORM public.validate_subscription_change_graph(NEW.id);END IF;RETURN NULL;
END; $$;
CREATE OR REPLACE FUNCTION public.preview_subscription_action(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity AND org_id=public.get_user_org_id()) THEN RAISE EXCEPTION 'subscription preview entity unavailable'; END IF;
 RETURN public.subscription_plan(p_entity,p_kind,p_payload);
END; $$;
CREATE OR REPLACE FUNCTION public.get_subscription_history(p_contract uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_c public.finance_contracts%ROWTYPE;v_s record;v_rows jsonb;
BEGIN
 SELECT * INTO v_c FROM public.finance_contracts WHERE id=p_contract AND org_id=v_org;
 IF v_c.id IS NULL THEN RAISE EXCEPTION 'subscription history unavailable'; END IF;
 FOR v_s IN SELECT id FROM public.finance_subscription_changes WHERE contract_id=p_contract OR replacement_id=p_contract LOOP PERFORM public.validate_subscription_change_graph(v_s.id);END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'action',s.action,'effectiveOn',s.effective_on,'contractId',s.contract_id,'replacementId',s.replacement_id,'creditId',s.credit_id,'reversedOn',s.reversal_date,'proposal',r.source_snapshot,'requestId',r.id) ORDER BY s.effective_on,s.id),'[]') INTO v_rows FROM public.finance_subscription_changes s JOIN public.finance_requests r ON r.id=s.request_id WHERE s.contract_id=p_contract OR s.replacement_id=p_contract;
 RETURN jsonb_build_object('contractId',p_contract,'entityId',v_c.entity_id,'currency',v_c.currency,'terms',v_c.terms,'changes',v_rows);
END; $$;

-- Calendar anchors also govern subsequent untouched-cycle repricing.
CREATE OR REPLACE FUNCTION public.execute_contract_extension(p_request public.finance_requests)
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
    v_next:=CASE WHEN (v_c.terms->>'cycle_months')::int=0 THEN v_cycle.ends_on+1 ELSE (coalesce((v_c.terms->>'billing_anchor')::date,(v_c.terms->>'starts_on')::date)+make_interval(months=>(v_cycle.cycle_number+coalesce((v_c.terms->>'billing_offset')::int,0))*(v_c.terms->>'cycle_months')::int))::date END;
    v_price:=round(public.cash_amount(v_p->>'new_price')*(v_cycle.ends_on-v_cycle.starts_on+1)::numeric/(v_next-CASE WHEN v_c.terms ? 'billing_anchor' THEN ((v_c.terms->>'billing_anchor')::date+make_interval(months=>(v_cycle.cycle_number-1+(v_c.terms->>'billing_offset')::int)*(v_c.terms->>'cycle_months')::int))::date ELSE v_cycle.starts_on END),2);
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

CREATE OR REPLACE FUNCTION public.get_customer_adjustments(p_entity uuid,p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;v_credits jsonb;v_s record;
BEGIN
 v_result:=public.pre_subscription_customer_adjustments(p_entity,p_as_of)-'revision';
 FOR v_s IN SELECT id FROM public.finance_subscription_changes WHERE entity_id=p_entity AND org_id=public.get_user_org_id() LOOP PERFORM public.validate_subscription_change_graph(v_s.id);END LOOP;
 SELECT coalesce(jsonb_agg(c||jsonb_build_object('subscriptionChangeId',s.id,'subscriptionContractId',s.contract_id) ORDER BY n),'[]') INTO v_credits FROM jsonb_array_elements(v_result->'credits') WITH ORDINALITY x(c,n) LEFT JOIN public.finance_subscription_changes s ON s.credit_id=(c->>'id')::uuid;
 v_result:=v_result||jsonb_build_object('credits',v_credits);RETURN v_result||jsonb_build_object('revision',md5(v_result::text));
END; $$;
DO $$ DECLARE t text;f record;
BEGIN
 FOREACH t IN ARRAY ARRAY['finance_subscription_changes','finance_subscription_actions'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(org_id=public.get_user_org_id())',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS subscription_graph ON public.%I',t);EXECUTE format('CREATE CONSTRAINT TRIGGER subscription_graph AFTER INSERT OR UPDATE OR DELETE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_subscription_graph_trigger()',t);
 END LOOP;
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
  ('validate_finance_extension','execute_finance_extension','finance_source_snapshot','validate_customer_extension','execute_customer_extension','customer_source_snapshot','concession_credit_preview','customer_credit_preview','contract_earned','execute_contract_extension','subscription_cycle_price','assert_subscription_open','execute_subscription_child','require_subscription_child','subscription_plan','validate_subscription_action_graph','validate_subscription_change_graph','check_subscription_graph_trigger','preview_subscription_action','get_subscription_history','get_customer_adjustments','pre_subscription_customer_adjustments') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname IN ('preview_subscription_action','get_subscription_history','get_customer_adjustments') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
END; $$;
COMMIT;
