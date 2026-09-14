BEGIN;
LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF to_regprocedure('public.pre_revision_validate(uuid,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.validate_finance_extension(uuid,text,jsonb) RENAME TO pre_revision_validate;
  ALTER FUNCTION public.finance_source_snapshot(uuid,text,jsonb) RENAME TO pre_revision_snapshot;
  ALTER FUNCTION public.execute_finance_extension(public.finance_requests) RENAME TO pre_revision_execute;
  ALTER FUNCTION public.contract_earned(uuid,date,jsonb) RENAME TO pre_revision_earned;
 END IF;
END; $$;

-- Original contracts, invoices and revenue entries remain immutable. A revision
-- retains a reviewed measure of progress and its signed catch-up separately.
CREATE TABLE IF NOT EXISTS public.finance_revenue_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,cycle_id uuid NOT NULL,
 version integer NOT NULL,as_of date NOT NULL,price numeric(15,2) NOT NULL,plan jsonb NOT NULL,
 amount numeric(15,2) NOT NULL,allocations jsonb NOT NULL,journal_lines jsonb NOT NULL,journal_id uuid,
 request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id),UNIQUE(cycle_id,version),UNIQUE(request_id),UNIQUE(journal_id),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,cycle_id) REFERENCES public.finance_contract_cycles(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,journal_id) REFERENCES public.journal_entries(org_id,id),
 CHECK(version BETWEEN 1 AND 200 AND price>=0 AND price::text NOT IN ('NaN','Infinity','-Infinity') AND amount::text NOT IN ('NaN','Infinity','-Infinity'))
);
CREATE TABLE IF NOT EXISTS public.finance_revenue_supplements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,cycle_id uuid NOT NULL,
 revision_id uuid NOT NULL,as_of date NOT NULL,amount numeric(15,2) NOT NULL,invoice_id uuid NOT NULL,
 deferral_journal uuid,transfer_journal uuid,request_id uuid NOT NULL,
 UNIQUE(org_id,id),UNIQUE(invoice_id),UNIQUE(request_id),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,cycle_id) REFERENCES public.finance_contract_cycles(org_id,id),
 FOREIGN KEY(org_id,revision_id) REFERENCES public.finance_revenue_revisions(org_id,id),
 FOREIGN KEY(org_id,invoice_id) REFERENCES public.invoices(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,deferral_journal) REFERENCES public.journal_entries(org_id,id),
 FOREIGN KEY(org_id,transfer_journal) REFERENCES public.journal_entries(org_id,id),
 CHECK(amount>0 AND amount::text NOT IN ('NaN','Infinity','-Infinity'))
);
CREATE OR REPLACE VIEW public.finance_revenue_movements AS
 SELECT id,org_id,cycle_id,as_of,amount,allocations,request_id,journal_id,transfer_journal,evidence,created_at,'RECOGNITION'::text AS movement_kind FROM public.finance_revenue_entries
 UNION ALL SELECT id,org_id,cycle_id,as_of,amount,allocations,request_id,journal_id,NULL::uuid,'[]'::jsonb,created_at,'REVISION' FROM public.finance_revenue_revisions;
REVOKE ALL ON public.finance_revenue_movements FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.revenue_cycle_invoices(p_cycle uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT invoice_id FROM public.finance_contract_cycles WHERE id=p_cycle AND invoice_id IS NOT NULL
 UNION ALL SELECT invoice_id FROM public.finance_revenue_supplements WHERE cycle_id=p_cycle
$$;
CREATE OR REPLACE FUNCTION public.revenue_credit_totals(p_cycle uuid,p_date date,p_key text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('amount',round(coalesce(sum((a->>'amount')::numeric),0),2)::text,'recognized',round(coalesce(sum((a->>'recognized')::numeric),0),2)::text)
 FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.obligations) a
 WHERE c.invoice_id IN (SELECT public.revenue_cycle_invoices(p_cycle)) AND c.as_of<=p_date AND (c.reversal_date IS NULL OR c.reversal_date>p_date) AND (p_key IS NULL OR a->>'key'=p_key)
$$;
CREATE OR REPLACE FUNCTION public.revenue_cycle_balances(p_cycle uuid,p_date date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH amounts AS (SELECT
  coalesce((SELECT sum(i.subtotal) FROM public.invoices i WHERE i.id IN (SELECT public.revenue_cycle_invoices(p_cycle)) AND i.issue_date<=p_date),0)
   -(public.revenue_credit_totals(p_cycle,p_date)->>'amount')::numeric AS billed,
  coalesce((SELECT sum(amount) FROM public.finance_revenue_movements WHERE cycle_id=p_cycle AND as_of<=p_date),0)
   -(public.revenue_credit_totals(p_cycle,p_date)->>'recognized')::numeric AS recognized)
 SELECT jsonb_build_object('billed',round(billed,2)::text,'recognized',round(recognized,2)::text,'deferred',round(greatest(billed-recognized,0),2)::text,'unbilled',round(greatest(recognized-billed,0),2)::text) FROM amounts
$$;
CREATE OR REPLACE FUNCTION public.revenue_plan_value(p_obligation jsonb,p_date date,p_evidence jsonb DEFAULT '[]')
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE amount numeric:=(p_obligation->>'amount')::numeric;baseline numeric:=(p_obligation->>'baseline')::numeric;ratio numeric;e jsonb;start_date date:=(p_obligation->>'starts_on')::date;end_date date:=(p_obligation->>'ends_on')::date;
BEGIN
 IF p_obligation->>'method'='DAILY' THEN ratio:=greatest(0,least(p_date,end_date)-start_date+1)::numeric/(end_date-start_date+1);
 ELSIF p_obligation->>'method'='PERCENT_COMPLETE' THEN ratio:=(p_obligation->>'progress')::numeric/100;
 ELSE
  SELECT value INTO e FROM jsonb_array_elements(p_evidence) WHERE value->>'key'=p_obligation->>'key';
  IF e IS NOT NULL AND (e-ARRAY['key','satisfied_on','reference']<>'{}'::jsonb OR coalesce(e->>'satisfied_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR length(btrim(coalesce(e->>'reference',''))) NOT BETWEEN 1 AND 500 OR (e->>'satisfied_on')::date NOT BETWEEN start_date AND least(end_date,p_date)) THEN RAISE EXCEPTION 'revised milestone requires dated transfer evidence';END IF;
  ratio:=CASE WHEN e IS NOT NULL OR (p_obligation->>'progress')::numeric=100 THEN 1 ELSE 0 END;
 END IF;
 RETURN round(baseline+(amount-baseline)*ratio,2);
END; $$;
CREATE OR REPLACE FUNCTION public.revenue_change_lines(p_cycle uuid,p_before jsonb,p_after_recognized numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.finance_contracts%ROWTYPE;revenue uuid;deferred uuid;unbilled uuid;billed numeric:=(p_before->>'billed')::numeric;prior numeric:=(p_before->>'recognized')::numeric;d numeric;lines jsonb:='[]';item record;
BEGIN
 SELECT c1.* INTO c FROM public.finance_contracts c1 JOIN public.finance_contract_cycles s ON s.contract_id=c1.id WHERE s.id=p_cycle;
 SELECT revenue_account_id INTO revenue FROM public.entity_invoice_account_controls WHERE entity_id=c.entity_id;
 deferred:=(c.terms->>'deferred_account_id')::uuid;unbilled:=(c.terms->>'unbilled_account_id')::uuid;
 FOR item IN SELECT unbilled AS account,greatest(p_after_recognized-billed,0)-greatest(prior-billed,0) AS delta
  UNION ALL SELECT deferred,greatest(billed-prior,0)-greatest(billed-p_after_recognized,0)
  UNION ALL SELECT revenue,prior-p_after_recognized LOOP
  d:=round(item.delta,2);IF d<>0 THEN lines:=lines||jsonb_build_array(jsonb_build_object('account_id',item.account,'debit',greatest(d,0)::numeric(38,2)::text,'credit',greatest(-d,0)::numeric(38,2)::text));END IF;
 END LOOP;RETURN lines;
END; $$;
CREATE OR REPLACE FUNCTION public.require_revisable_finance_date(p_entity uuid,p_date date)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.accounting_periods WHERE entity_id=p_entity AND p_date BETWEEN period_start AND period_end AND status='OPEN') OR EXISTS(SELECT 1 FROM public.finance_year_closes WHERE entity_id=p_entity AND active AND p_date BETWEEN starts_on AND ends_on) OR EXISTS(SELECT 1 FROM public.finance_consolidations close JOIN public.finance_groups grp ON grp.id=close.group_id WHERE close.active AND p_entity=ANY(grp.member_ids) AND p_date<=close.ends_on) THEN RAISE EXCEPTION 'reopen the accepted finance period and consolidation before recording an accounting change';END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.revenue_revision_preview(p_entity uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.finance_contract_cycles%ROWTYPE;c public.finance_contracts%ROWTYPE;r public.finance_revenue_revisions%ROWTYPE;
 day date;price numeric;total numeric:=0;before jsonb;credits jsonb;item jsonb;normalized jsonb;plan jsonb:='[]';deltas jsonb:='[]';seen text[]:='{}';prior numeric;net_prior numeric;target numeric;delta numeric;change numeric:=0;net_target numeric:=0;baseline numeric;
BEGIN
 IF p_payload-ARRAY['cycle_id','date','price','reference','policy_evidence','variable_consideration','obligations']<>'{}'::jsonb OR coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR jsonb_typeof(p_payload->'price') IS DISTINCT FROM 'string' OR length(btrim(coalesce(p_payload->>'reference',''))) NOT BETWEEN 1 AND 160 OR length(btrim(coalesce(p_payload->>'policy_evidence',''))) NOT BETWEEN 1 AND 2000 OR length(btrim(coalesce(p_payload->>'variable_consideration',''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'revenue revision requires dated terms, an exact price, classification and variable-consideration assessment';END IF;
 SELECT * INTO s FROM public.finance_contract_cycles WHERE id=(p_payload->>'cycle_id')::uuid AND org_id=public.get_user_org_id();
 SELECT * INTO c FROM public.finance_contracts WHERE id=s.contract_id AND entity_id=p_entity;
 day:=(p_payload->>'date')::date;price:=public.cash_amount(p_payload->>'price');
 IF c.id IS NULL OR c.terms->>'kind'<>'FIXED' OR s.invoice_id IS NULL OR s.cancel_request IS NOT NULL OR s.credit_id IS NOT NULL OR day NOT BETWEEN greatest(s.starts_on,s.invoice_date) AND CURRENT_DATE OR price<0 THEN RAISE EXCEPTION 'revenue revision requires an active billed fixed cycle and a delivered-service date';END IF;
 IF EXISTS(SELECT 1 FROM public.finance_subscription_changes WHERE contract_id=c.id AND reversal_request IS NULL) THEN RAISE EXCEPTION 'revise the active replacement contract after a subscription change';END IF;
 IF EXISTS(SELECT 1 FROM public.finance_revenue_movements WHERE cycle_id=s.id AND as_of>day) OR EXISTS(SELECT 1 FROM public.finance_customer_credits WHERE invoice_id IN (SELECT public.revenue_cycle_invoices(s.id)) AND (as_of>day OR reversal_date>day)) OR EXISTS(SELECT 1 FROM public.finance_revenue_supplements WHERE cycle_id=s.id AND as_of>day) THEN RAISE EXCEPTION 'revision must follow all billing, credit and recognition history';END IF;
 SELECT * INTO r FROM public.finance_revenue_revisions WHERE cycle_id=s.id ORDER BY version DESC LIMIT 1;
 IF r.as_of>=day OR coalesce(r.version,0)>=200 THEN RAISE EXCEPTION 'each revision requires a later accounting date, within 200 retained versions';END IF;
 PERFORM public.require_revisable_finance_date(p_entity,day);before:=public.revenue_cycle_balances(s.id,day);
 IF price<(before->>'billed')::numeric THEN RAISE EXCEPTION 'approve source invoice credits for the overbilled amount before reducing the transaction price';END IF;
 IF jsonb_typeof(p_payload->'obligations') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'obligations')<>jsonb_array_length(s.allocations) THEN RAISE EXCEPTION 'revise every original obligation exactly once';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_payload->'obligations') LOOP
  IF item-ARRAY['key','amount','treatment','method','starts_on','ends_on','progress','evidence']<>'{}'::jsonb OR item->>'key'=ANY(seen) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.allocations) a WHERE a->>'key'=item->>'key') OR
   jsonb_typeof(item->'amount') IS DISTINCT FROM 'string' OR public.cash_amount(item->>'amount')<0 OR coalesce(item->>'treatment','') NOT IN ('PROSPECTIVE','CATCH_UP') OR coalesce(item->>'method','') NOT IN ('DAILY','MILESTONE','PERCENT_COMPLETE') OR
   coalesce(item->>'starts_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(item->>'ends_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(item->>'progress','') !~ '^[0-9]{1,3}(\.[0-9]{1,6})?$' OR jsonb_typeof(item->'progress') IS DISTINCT FROM 'string' OR (item->>'progress')::numeric NOT BETWEEN 0 AND 100 OR length(btrim(coalesce(item->>'evidence',''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'invalid revised obligation, allocation or progress evidence';END IF;
  IF (item->>'starts_on')::date<s.starts_on OR (item->>'ends_on')::date>s.ends_on OR (item->>'ends_on')::date<(item->>'starts_on')::date OR
   (item->>'treatment'='PROSPECTIVE' AND ((item->>'starts_on')::date<=day OR (item->>'progress')::numeric<>0)) OR
   (item->>'treatment'='CATCH_UP' AND (item->>'starts_on')::date>day) OR
   (item->>'method'='MILESTONE' AND (item->>'progress')::numeric NOT IN (0,100)) THEN RAISE EXCEPTION 'prospective service starts after the revision; catch-up measures completed service';END IF;
  seen:=array_append(seen,item->>'key');credits:=public.revenue_credit_totals(s.id,day,item->>'key');
  SELECT coalesce(sum((a->>'amount')::numeric),0) INTO prior FROM public.finance_revenue_movements m CROSS JOIN LATERAL jsonb_array_elements(m.allocations) a WHERE m.cycle_id=s.id AND a->>'key'=item->>'key';
  net_prior:=prior-(credits->>'recognized')::numeric;baseline:=CASE WHEN item->>'treatment'='PROSPECTIVE' THEN net_prior ELSE 0 END;
  IF net_prior<0 OR baseline>public.cash_amount(item->>'amount') THEN RAISE EXCEPTION 'prospective allocation must preserve already recognized revenue';END IF;
  normalized:=item||jsonb_build_object('baseline',baseline::numeric(38,2)::text,'creditsAtRevision',credits->>'amount');
  target:=public.revenue_plan_value(normalized,day);delta:=target+(credits->>'recognized')::numeric-prior;
  plan:=plan||jsonb_build_array(normalized);deltas:=deltas||jsonb_build_array(jsonb_build_object('key',item->>'key','amount',delta::numeric(38,2)::text));
  change:=change+delta;net_target:=net_target+target;total:=total+public.cash_amount(item->>'amount');
 END LOOP;
 IF total<>price THEN RAISE EXCEPTION 'revised allocations must equal the approved net transaction price';END IF;
 RETURN jsonb_build_object('cycleId',s.id,'version',coalesce(r.version,0)+1,'price',price::numeric(38,2)::text,'plan',plan,'amount',change::numeric(38,2)::text,'allocations',deltas,'before',before,'afterRecognized',net_target::numeric(38,2)::text,'journalLines',public.revenue_change_lines(s.id,before,net_target));
END; $$;

CREATE OR REPLACE FUNCTION public.contract_earned(p_cycle_id uuid,p_as_of date,p_evidence jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.finance_revenue_revisions%ROWTYPE;item jsonb;credits jsonb;price numeric;reduced numeric;earned_value numeric;result jsonb:='[]';evidence jsonb;
BEGIN
 SELECT * INTO r FROM public.finance_revenue_revisions WHERE cycle_id=p_cycle_id AND as_of<=p_as_of ORDER BY version DESC LIMIT 1;
 IF r.id IS NULL THEN RETURN public.pre_revision_earned(p_cycle_id,p_as_of,p_evidence);END IF;
 IF jsonb_typeof(p_evidence) IS DISTINCT FROM 'array' OR jsonb_array_length(p_evidence)>20 OR (SELECT count(*)<>count(DISTINCT a->>'key') FROM jsonb_array_elements(p_evidence) a) OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_evidence) a WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(r.plan) o WHERE o->>'key'=a->>'key' AND o->>'method'='MILESTONE')) THEN RAISE EXCEPTION 'invalid revised fulfillment evidence';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(r.plan) LOOP
  credits:=public.revenue_credit_totals(p_cycle_id,p_as_of,item->>'key');price:=(item->>'amount')::numeric;
  reduced:=(credits->>'amount')::numeric-(item->>'creditsAtRevision')::numeric;
  IF reduced<0 OR reduced>price THEN RAISE EXCEPTION 'revised consideration no longer reconciles to dated invoice credits';END IF;
  evidence:=p_evidence;
  IF item->>'method'='MILESTONE' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(evidence) e WHERE e->>'key'=item->>'key') THEN
   SELECT coalesce(jsonb_agg(e),'[]') INTO evidence FROM (SELECT e FROM public.finance_revenue_entries m CROSS JOIN LATERAL jsonb_array_elements(m.evidence) e WHERE m.cycle_id=p_cycle_id AND m.as_of BETWEEN r.as_of AND p_as_of AND e->>'key'=item->>'key' ORDER BY m.as_of DESC LIMIT 1) prior;
  END IF;
  earned_value:=public.revenue_plan_value(item,p_as_of,evidence);earned_value:=earned_value-CASE WHEN price=0 THEN 0 ELSE round(earned_value*reduced/price,2) END+(credits->>'recognized')::numeric;
  result:=result||jsonb_build_array(jsonb_build_object('key',item->>'key','amount',round(earned_value,2)::text));
 END LOOP;RETURN result;
END; $$;

CREATE OR REPLACE FUNCTION public.revenue_gross_price(p_cycle uuid,p_date date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT r.price+(SELECT coalesce(sum((a->>'creditsAtRevision')::numeric),0) FROM jsonb_array_elements(r.plan) a) FROM public.finance_revenue_revisions r WHERE r.cycle_id=p_cycle AND r.as_of<=p_date ORDER BY r.version DESC LIMIT 1),(SELECT price FROM public.finance_contract_cycles WHERE id=p_cycle))
$$;
CREATE OR REPLACE FUNCTION public.revenue_allocation_basis(p_cycle uuid,p_date date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT jsonb_agg(a||jsonb_build_object('amount',round((a->>'amount')::numeric+(a->>'creditsAtRevision')::numeric,2)::text) ORDER BY n) FROM public.finance_revenue_revisions r CROSS JOIN LATERAL jsonb_array_elements(r.plan) WITH ORDINALITY x(a,n) WHERE r.id=(SELECT id FROM public.finance_revenue_revisions WHERE cycle_id=p_cycle AND as_of<=p_date ORDER BY version DESC LIMIT 1)),(SELECT allocations FROM public.finance_contract_cycles WHERE id=p_cycle))
$$;
CREATE OR REPLACE FUNCTION public.revenue_revision_state(p_cycle uuid,p_date date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('cycle',(SELECT to_jsonb(s) FROM public.finance_contract_cycles s WHERE id=p_cycle),'before',public.revenue_cycle_balances(p_cycle,p_date),
  'revisions',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY version) FROM public.finance_revenue_revisions r WHERE cycle_id=p_cycle),'[]'),
  'recognitions',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.finance_revenue_entries r WHERE cycle_id=p_cycle),'[]'),
  'supplements',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.finance_revenue_supplements r WHERE cycle_id=p_cycle),'[]'),
  'credits',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.finance_customer_credits r WHERE invoice_id IN (SELECT public.revenue_cycle_invoices(p_cycle))),'[]'))
$$;
CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.finance_contract_cycles%ROWTYPE;c public.finance_contracts%ROWTYPE;r public.finance_revenue_revisions%ROWTYPE;day date;amount numeric;
BEGIN
 IF p_kind='CONTRACT_REVISE' THEN PERFORM public.revenue_revision_preview(p_entity,p_payload);RETURN p_payload;END IF;
 IF p_kind='CONTRACT_SUPPLEMENT_BILL' THEN
  SELECT * INTO s FROM public.finance_contract_cycles WHERE id=(p_payload->>'cycle_id')::uuid AND org_id=public.get_user_org_id();SELECT * INTO c FROM public.finance_contracts WHERE id=s.contract_id AND entity_id=p_entity;
  SELECT * INTO r FROM public.finance_revenue_revisions WHERE cycle_id=s.id ORDER BY version DESC LIMIT 1;
  IF c.id IS NULL OR r.id IS NULL OR p_payload-ARRAY['cycle_id','number','issue_date','due_date','amount','tax']<>'{}'::jsonb OR coalesce(p_payload->>'issue_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_payload->>'due_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR length(btrim(coalesce(p_payload->>'number',''))) NOT BETWEEN 1 AND 80 OR jsonb_typeof(p_payload->'amount') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'supplemental invoice requires an approved revision, exact amount and invoice dates';END IF;
  day:=(p_payload->>'issue_date')::date;amount:=public.cash_amount(p_payload->>'amount');
  IF day<r.as_of OR day>CURRENT_DATE OR (p_payload->>'due_date')::date<day OR amount<=0 OR amount>public.revenue_gross_price(s.id,day)-(public.revenue_credit_totals(s.id,day)->>'amount')::numeric-(public.revenue_cycle_balances(s.id,day)->>'billed')::numeric OR EXISTS(SELECT 1 FROM public.finance_revenue_movements WHERE cycle_id=s.id AND as_of>day) OR EXISTS(SELECT 1 FROM public.finance_revenue_supplements WHERE cycle_id=s.id AND as_of>day) THEN RAISE EXCEPTION 'supplement exceeds approved unbilled consideration or precedes contract history';END IF;
  IF coalesce((c.terms->>'tax_required')::boolean,false) AND NOT p_payload?'tax' THEN RAISE EXCEPTION 'this contract requires a tax assessment on every invoice';END IF;
  IF p_payload?'tax' THEN PERFORM public.tax_assessment(p_entity,'AR',day,jsonb_build_array(jsonb_build_object('description',c.reference||' revised consideration','quantity','1','unit_price',amount::numeric(38,2)::text)),p_payload->'tax');END IF;
  PERFORM public.validate_contract_graph(c.id);RETURN p_payload;
 END IF;
 IF p_kind IN ('CUSTOMER_CREDIT','CUSTOMER_CREDIT_REVERSE') THEN
  SELECT s1.* INTO s FROM public.finance_contract_cycles s1 WHERE (p_kind='CUSTOMER_CREDIT' AND (p_payload->>'invoice_id')::uuid IN (SELECT public.revenue_cycle_invoices(s1.id))) OR (p_kind='CUSTOMER_CREDIT_REVERSE' AND EXISTS(SELECT 1 FROM public.finance_customer_credits cr WHERE cr.id=(p_payload->>'credit_id')::uuid AND cr.invoice_id IN (SELECT public.revenue_cycle_invoices(s1.id))));
  SELECT * INTO r FROM public.finance_revenue_revisions WHERE cycle_id=s.id ORDER BY version DESC LIMIT 1;
  IF r.id IS NOT NULL THEN
   IF (p_payload->>'date')::date<=r.as_of THEN RAISE EXCEPTION 'credit activity must follow the latest revenue revision';END IF;
   IF p_kind='CUSTOMER_CREDIT_REVERSE' AND EXISTS(SELECT 1 FROM public.finance_customer_credits WHERE id=(p_payload->>'credit_id')::uuid AND as_of<=r.as_of) THEN RAISE EXCEPTION 'a retained revenue revision depends on this credit; approve subsequent economic corrections';END IF;
  END IF;
 END IF;
 IF p_kind IN ('CONTRACT_CREDIT','SUBSCRIPTION_CHANGE','SUBSCRIPTION_CANCEL') AND EXISTS(SELECT 1 FROM public.finance_revenue_revisions blocked_revision JOIN public.finance_contract_cycles blocked_cycle ON blocked_cycle.id=blocked_revision.cycle_id WHERE blocked_cycle.id=(p_payload->>'cycle_id')::uuid OR blocked_cycle.contract_id=(p_payload->>'contract_id')::uuid) THEN RAISE EXCEPTION 'revised contracts use source invoice credits and dated revenue revisions for cancellation';END IF;
 RETURN public.pre_revision_validate(p_entity,p_kind,p_payload);
END; $$;
CREATE OR REPLACE FUNCTION public.finance_source_snapshot(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;cycle uuid;day date;
BEGIN
 IF p_kind='CONTRACT_REVISE' THEN RETURN jsonb_build_object('revisionPreview',public.revenue_revision_preview(p_entity,p_payload),'revisionState',public.revenue_revision_state((p_payload->>'cycle_id')::uuid,(p_payload->>'date')::date));END IF;
 IF p_kind='CONTRACT_SUPPLEMENT_BILL' THEN RETURN jsonb_build_object('revisionState',public.revenue_revision_state((p_payload->>'cycle_id')::uuid,(p_payload->>'issue_date')::date))||CASE WHEN p_payload?'tax' THEN jsonb_build_object('taxAssessment',public.tax_request_assessment(p_entity,p_kind,p_payload)) ELSE '{}'::jsonb END;END IF;
 result:=public.pre_revision_snapshot(p_entity,p_kind,p_payload);
 IF p_kind='CONTRACT_RECOGNIZE' THEN cycle:=(p_payload->>'cycle_id')::uuid;day:=(p_payload->>'as_of')::date;
 ELSIF p_kind='CUSTOMER_CREDIT' THEN SELECT id INTO cycle FROM public.finance_contract_cycles s WHERE (p_payload->>'invoice_id')::uuid IN (SELECT public.revenue_cycle_invoices(s.id));day:=(p_payload->>'date')::date;END IF;
 IF EXISTS(SELECT 1 FROM public.finance_revenue_revisions WHERE cycle_id=cycle) THEN result:=result||jsonb_build_object('revisionState',public.revenue_revision_state(cycle,day));END IF;
 RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE p jsonb:=p_request.payload;preview jsonb;id uuid;journal uuid;cycle public.finance_contract_cycles%ROWTYPE;c public.finance_contracts%ROWTYPE;r public.finance_revenue_revisions%ROWTYPE;day date;before jsonb;earned jsonb;item jsonb;prior numeric;delta numeric;amount numeric:=0;allocations jsonb:='[]';lines jsonb;invoice uuid;deferral uuid;transfer uuid;revenue uuid;
BEGIN
 IF p_request.kind='CONTRACT_REVISE' THEN
  preview:=public.revenue_revision_preview(p_request.entity_id,p);day:=(p->>'date')::date;
  IF jsonb_array_length(preview->'journalLines')>0 THEN journal:=public.post_manual_journal(p_request.entity_id,'REVENUE-REVISION-'||p_request.id,day,'Approved revenue revision: '||(p->>'reference'),preview->'journalLines','finance:'||p_request.id||':revenue-revision');END IF;
  INSERT INTO public.finance_revenue_revisions(org_id,entity_id,cycle_id,version,as_of,price,plan,amount,allocations,journal_lines,journal_id,request_id)
   VALUES(p_request.org_id,p_request.entity_id,(p->>'cycle_id')::uuid,(preview->>'version')::int,day,(preview->>'price')::numeric,preview->'plan',(preview->>'amount')::numeric,preview->'allocations',preview->'journalLines',journal,p_request.id) RETURNING finance_revenue_revisions.id INTO id;
  RETURN jsonb_build_object('revisionId',id,'journalId',journal,'amount',preview->>'amount');
 END IF;
 SELECT * INTO cycle FROM public.finance_contract_cycles WHERE finance_contract_cycles.id=(p->>'cycle_id')::uuid;
 SELECT * INTO c FROM public.finance_contracts WHERE finance_contracts.id=cycle.contract_id;
 SELECT * INTO r FROM public.finance_revenue_revisions WHERE cycle_id=cycle.id ORDER BY version DESC LIMIT 1;
 IF p_request.kind='CONTRACT_SUPPLEMENT_BILL' THEN
  day:=(p->>'issue_date')::date;amount:=public.cash_amount(p->>'amount');before:=public.revenue_cycle_balances(cycle.id,day);
  invoice:=public.post_customer_invoice(c.entity_id,c.customer_id,p->>'number',day,(p->>'due_date')::date,c.currency,0,c.reference||' revised consideration',jsonb_build_array(jsonb_build_object('description',c.reference||' revised consideration','quantity','1','unit_price',amount::numeric(38,2)::text)),'finance:'||p_request.id||':revenue-supplement');
  SELECT revenue_account_id INTO revenue FROM public.entity_invoice_account_controls WHERE entity_id=c.entity_id;
  deferral:=public.post_contract_transfer(c,p_request.id,'SUPPLEMENT-DEFER',day,revenue,(c.terms->>'deferred_account_id')::uuid,amount);
  transfer:=public.post_contract_transfer(c,p_request.id,'SUPPLEMENT-UNBILLED',day,(c.terms->>'deferred_account_id')::uuid,(c.terms->>'unbilled_account_id')::uuid,least(amount,(before->>'unbilled')::numeric));
  INSERT INTO public.finance_revenue_supplements(org_id,entity_id,cycle_id,revision_id,as_of,amount,invoice_id,deferral_journal,transfer_journal,request_id)
   VALUES(p_request.org_id,p_request.entity_id,cycle.id,r.id,day,amount,invoice,deferral,transfer,p_request.id) RETURNING finance_revenue_supplements.id INTO id;
  RETURN jsonb_build_object('supplementId',id,'invoiceId',invoice,'amount',amount::numeric(38,2)::text);
 END IF;
 IF p_request.kind='CONTRACT_RECOGNIZE' AND r.id IS NOT NULL THEN
  day:=(p->>'as_of')::date;
  IF day<=r.as_of OR EXISTS(SELECT 1 FROM public.finance_revenue_movements WHERE cycle_id=cycle.id AND as_of>day) THEN RAISE EXCEPTION 'recognition must follow revised revenue history';END IF;
  before:=public.revenue_cycle_balances(cycle.id,day);earned:=public.contract_earned(cycle.id,day,p->'evidence');
  FOR item IN SELECT value FROM jsonb_array_elements(earned) LOOP
   SELECT coalesce(sum((a->>'amount')::numeric),0) INTO prior FROM public.finance_revenue_movements m CROSS JOIN LATERAL jsonb_array_elements(m.allocations) a WHERE m.cycle_id=cycle.id AND a->>'key'=item->>'key';
   delta:=(item->>'amount')::numeric-prior;IF delta<0 THEN RAISE EXCEPTION 'reduced progress requires an approved revenue revision';END IF;
   amount:=amount+delta;allocations:=allocations||jsonb_build_array(jsonb_build_object('key',item->>'key','amount',delta::numeric(38,2)::text));
  END LOOP;
  IF amount<=0 THEN RAISE EXCEPTION 'no additional earned revenue is available';END IF;
  lines:=public.revenue_change_lines(cycle.id,before,(before->>'recognized')::numeric+amount);
  journal:=public.post_manual_journal(c.entity_id,'REVISED-RECOGNITION-'||p_request.id,day,'Earned service under approved revenue revision',lines,'finance:'||p_request.id||':revised-recognition');
  INSERT INTO public.finance_revenue_entries(org_id,cycle_id,as_of,amount,allocations,request_id,journal_id,evidence)
   VALUES(p_request.org_id,cycle.id,day,amount,allocations,p_request.id,journal,p->'evidence') RETURNING finance_revenue_entries.id INTO id;
  RETURN jsonb_build_object('recognitionId',id,'journalId',journal,'amount',amount::numeric(38,2)::text);
 END IF;
 RETURN public.pre_revision_execute(p_request);
END; $$;

CREATE OR REPLACE FUNCTION public.revenue_owned_journals(p_cycle uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT unnest(ARRAY[deferral_journal,unbilled_transfer_journal,credit_journal]) FROM public.finance_contract_cycles WHERE id=p_cycle
 UNION SELECT journal_id FROM public.finance_revenue_movements WHERE cycle_id=p_cycle
 UNION SELECT transfer_journal FROM public.finance_revenue_movements WHERE cycle_id=p_cycle
 UNION SELECT unnest(ARRAY[deferral_journal,transfer_journal]) FROM public.finance_revenue_supplements WHERE cycle_id=p_cycle
 UNION SELECT unnest(ARRAY[journal_id,reversal_journal]) FROM public.finance_customer_credits WHERE invoice_id IN (SELECT public.revenue_cycle_invoices(p_cycle))
$$;
CREATE OR REPLACE FUNCTION public.validate_revenue_revision_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.finance_revenue_revisions%ROWTYPE;q public.finance_requests%ROWTYPE;s public.finance_contract_cycles%ROWTYPE;c public.finance_contracts%ROWTYPE;
 preview jsonb;state jsonb;item jsonb;raw jsonb;prior numeric;credited numeric;credit_rec numeric;baseline numeric;target numeric;delta numeric;total numeric:=0;amount numeric:=0;net_target numeric:=0;expected jsonb:='[]';billed numeric;recognized numeric;before jsonb;
BEGIN
 SELECT * INTO r FROM public.finance_revenue_revisions WHERE id=p_id;SELECT * INTO q FROM public.finance_requests WHERE id=r.request_id;SELECT * INTO s FROM public.finance_contract_cycles WHERE id=r.cycle_id;SELECT * INTO c FROM public.finance_contracts WHERE id=s.contract_id;
 preview:=q.source_snapshot->'revisionPreview';state:=q.source_snapshot->'revisionState';
 IF r.id IS NULL OR q.org_id IS DISTINCT FROM r.org_id OR q.entity_id IS DISTINCT FROM r.entity_id OR c.entity_id IS DISTINCT FROM r.entity_id OR q.kind IS DISTINCT FROM 'CONTRACT_REVISE' OR q.state NOT IN ('EXECUTING','APPROVED') OR q.requested_by=q.decided_by OR q.payload->>'cycle_id' IS DISTINCT FROM r.cycle_id::text OR (q.payload->>'date')::date IS DISTINCT FROM r.as_of OR public.cash_amount(q.payload->>'price') IS DISTINCT FROM r.price OR
  preview-'before'-'afterRecognized' IS DISTINCT FROM jsonb_build_object('cycleId',r.cycle_id,'version',r.version,'price',r.price::text,'plan',r.plan,'amount',r.amount::text,'allocations',r.allocations,'journalLines',r.journal_lines) OR
  state->'cycle' IS DISTINCT FROM to_jsonb(s) OR r.version<>(SELECT count(*)+1 FROM public.finance_revenue_revisions WHERE cycle_id=r.cycle_id AND version<r.version) OR
  state->'revisions' IS DISTINCT FROM coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY version) FROM public.finance_revenue_revisions a WHERE cycle_id=r.cycle_id AND version<r.version),'[]') THEN RAISE EXCEPTION 'revenue revision approval or retained version chain is invalid';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(state->'recognitions') a WHERE NOT EXISTS(SELECT 1 FROM public.finance_revenue_entries e WHERE e.id=(a->>'id')::uuid AND to_jsonb(e)=a)) OR
  EXISTS(SELECT 1 FROM jsonb_array_elements(state->'supplements') a WHERE NOT EXISTS(SELECT 1 FROM public.finance_revenue_supplements e WHERE e.id=(a->>'id')::uuid AND to_jsonb(e)=a)) OR
  EXISTS(SELECT 1 FROM jsonb_array_elements(state->'credits') a WHERE NOT EXISTS(SELECT 1 FROM public.finance_customer_credits e WHERE e.id=(a->>'id')::uuid AND to_jsonb(e)=a)) THEN RAISE EXCEPTION 'revenue revision lost immutable accounting evidence';END IF;
 billed:=s.price+(SELECT coalesce(sum((a->>'amount')::numeric),0) FROM jsonb_array_elements(state->'supplements') a)-(SELECT coalesce(sum(public.customer_credit_net(a->'lines')),0) FROM jsonb_array_elements(state->'credits') a WHERE a->>'reversal_date' IS NULL);
 recognized:=(SELECT coalesce(sum((a->>'amount')::numeric),0) FROM jsonb_array_elements((state->'recognitions')||(state->'revisions')) a)-(SELECT coalesce(sum((o->>'recognized')::numeric),0) FROM jsonb_array_elements(state->'credits') a CROSS JOIN LATERAL jsonb_array_elements(a->'obligations') o WHERE a->>'reversal_date' IS NULL);
 before:=jsonb_build_object('billed',billed::numeric(38,2)::text,'recognized',recognized::numeric(38,2)::text,'deferred',greatest(billed-recognized,0)::numeric(38,2)::text,'unbilled',greatest(recognized-billed,0)::numeric(38,2)::text);
 IF state->'before' IS DISTINCT FROM before OR preview->'before' IS DISTINCT FROM before THEN RAISE EXCEPTION 'revenue revision prior balances do not reconcile';END IF;
 IF jsonb_array_length(r.plan)<>jsonb_array_length(q.payload->'obligations') OR (SELECT count(*)<>count(DISTINCT a->>'key') FROM jsonb_array_elements(r.plan) a) THEN RAISE EXCEPTION 'revision obligation set is invalid';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(r.plan) LOOP
  SELECT value INTO raw FROM jsonb_array_elements(q.payload->'obligations') WHERE value->>'key'=item->>'key';
  SELECT coalesce(sum((o->>'amount')::numeric),0),coalesce(sum((o->>'recognized')::numeric),0) INTO credited,credit_rec FROM jsonb_array_elements(state->'credits') a CROSS JOIN LATERAL jsonb_array_elements(a->'obligations') o WHERE a->>'reversal_date' IS NULL AND o->>'key'=item->>'key';
  SELECT coalesce(sum((o->>'amount')::numeric),0) INTO prior FROM jsonb_array_elements((state->'recognitions')||(state->'revisions')) a CROSS JOIN LATERAL jsonb_array_elements(a->'allocations') o WHERE o->>'key'=item->>'key';
  baseline:=CASE WHEN raw->>'treatment'='PROSPECTIVE' THEN prior-credit_rec ELSE 0 END;
  IF item IS DISTINCT FROM raw||jsonb_build_object('baseline',baseline::numeric(38,2)::text,'creditsAtRevision',credited::numeric(38,2)::text) THEN RAISE EXCEPTION 'revenue revision allocation differs from approved terms';END IF;
  target:=public.revenue_plan_value(item,r.as_of);delta:=target+credit_rec-prior;total:=total+(item->>'amount')::numeric;net_target:=net_target+target;amount:=amount+delta;
  expected:=expected||jsonb_build_array(jsonb_build_object('key',item->>'key','amount',delta::numeric(38,2)::text));
 END LOOP;
 IF r.price<>total OR r.amount<>amount OR r.allocations IS DISTINCT FROM expected OR preview->>'afterRecognized' IS DISTINCT FROM net_target::numeric(38,2)::text OR r.journal_lines IS DISTINCT FROM public.revenue_change_lines(s.id,before,net_target) THEN RAISE EXCEPTION 'revenue revision catch-up does not reconcile to progress and consideration';END IF;
 IF jsonb_array_length(r.journal_lines)=0 THEN IF r.journal_id IS NOT NULL THEN RAISE EXCEPTION 'zero revenue reallocation cannot own a journal';END IF;
 ELSE
  PERFORM public.assert_finance_journal(r.journal_id,r.org_id,r.entity_id,r.as_of,r.journal_lines);
  IF NOT EXISTS(SELECT 1 FROM public.journal_entries j JOIN public.accounting_events e ON e.id=j.accounting_event_id WHERE j.id=r.journal_id AND j.created_by=q.decided_by AND e.idempotency_key='finance:'||q.id||':revenue-revision') THEN RAISE EXCEPTION 'revenue revision journal provenance is invalid';END IF;
 END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.validate_revenue_supplement_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.finance_revenue_supplements%ROWTYPE;q public.finance_requests%ROWTYPE;c public.finance_contracts%ROWTYPE;s public.finance_contract_cycles%ROWTYPE;r public.finance_revenue_revisions%ROWTYPE;revenue uuid;
BEGIN
 SELECT * INTO b FROM public.finance_revenue_supplements WHERE id=p_id;SELECT * INTO q FROM public.finance_requests WHERE id=b.request_id;SELECT * INTO s FROM public.finance_contract_cycles WHERE id=b.cycle_id;SELECT * INTO c FROM public.finance_contracts WHERE id=s.contract_id;SELECT * INTO r FROM public.finance_revenue_revisions WHERE id=b.revision_id;
 IF b.id IS NULL OR c.org_id IS DISTINCT FROM b.org_id OR c.entity_id IS DISTINCT FROM b.entity_id OR r.cycle_id IS DISTINCT FROM s.id OR r.as_of>b.as_of OR q.org_id IS DISTINCT FROM b.org_id OR q.entity_id IS DISTINCT FROM b.entity_id OR q.kind IS DISTINCT FROM 'CONTRACT_SUPPLEMENT_BILL' OR q.state NOT IN ('EXECUTING','APPROVED') OR q.requested_by=q.decided_by OR q.payload->>'cycle_id' IS DISTINCT FROM b.cycle_id::text OR (q.payload->>'issue_date')::date IS DISTINCT FROM b.as_of OR public.cash_amount(q.payload->>'amount') IS DISTINCT FROM b.amount THEN RAISE EXCEPTION 'supplemental revenue invoice approval graph is invalid';END IF;
 PERFORM public.validate_customer_invoice_graph(b.invoice_id);
 IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=b.invoice_id AND org_id=b.org_id AND entity_id=b.entity_id AND customer_id=c.customer_id AND subtotal=b.amount AND issue_date=b.as_of AND invoice_number=q.payload->>'number' AND due_date=(q.payload->>'due_date')::date AND EXISTS(SELECT 1 FROM public.accounting_events e WHERE e.id=invoices.accounting_event_id AND e.idempotency_key='finance:'||q.id||':revenue-supplement')) THEN RAISE EXCEPTION 'supplemental invoice differs from approved consideration';END IF;
 SELECT revenue_account_id INTO revenue FROM public.entity_invoice_account_controls WHERE entity_id=c.entity_id;
 PERFORM public.assert_contract_journal(b.deferral_journal,c.entity_id,b.as_of,revenue,(c.terms->>'deferred_account_id')::uuid,b.amount);
 PERFORM public.assert_contract_journal(b.transfer_journal,c.entity_id,b.as_of,(c.terms->>'deferred_account_id')::uuid,(c.terms->>'unbilled_account_id')::uuid,least(b.amount,(q.source_snapshot->'revisionState'->'before'->>'unbilled')::numeric));
END; $$;
CREATE OR REPLACE FUNCTION public.validate_revised_cycle_graph(p_cycle uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.finance_contract_cycles%ROWTYPE;c public.finance_contracts%ROWTYPE;item record;q public.finance_requests%ROWTYPE;revenue uuid;deferred uuid;unbilled uuid;day record;balances jsonb;gl_d numeric;gl_u numeric;expected jsonb;earned jsonb;prior numeric;delta numeric;allocation jsonb;history jsonb;
BEGIN
 SELECT * INTO s FROM public.finance_contract_cycles WHERE id=p_cycle;SELECT * INTO c FROM public.finance_contracts WHERE id=s.contract_id;
 deferred:=(c.terms->>'deferred_account_id')::uuid;unbilled:=(c.terms->>'unbilled_account_id')::uuid;SELECT revenue_account_id INTO revenue FROM public.entity_invoice_account_controls WHERE entity_id=c.entity_id;
 IF s.invoice_id IS NULL OR s.credit_id IS NOT NULL OR s.cancel_request IS NOT NULL THEN RAISE EXCEPTION 'revised cycle requires its original active invoice';END IF;
 PERFORM public.validate_customer_invoice_graph(s.invoice_id);
 IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=s.invoice_id AND org_id=c.org_id AND entity_id=c.entity_id AND customer_id=c.customer_id AND subtotal=s.price AND issue_date=s.invoice_date) THEN RAISE EXCEPTION 'revised cycle original invoice is invalid';END IF;
 PERFORM public.assert_contract_journal(s.deferral_journal,c.entity_id,s.invoice_date,revenue,deferred,s.price);
 IF s.unbilled_transfer_journal IS NOT NULL THEN SELECT debit INTO prior FROM public.journal_lines WHERE journal_entry_id=s.unbilled_transfer_journal AND account_id=deferred;PERFORM public.assert_contract_journal(s.unbilled_transfer_journal,c.entity_id,s.invoice_date,deferred,unbilled,prior);END IF;
 FOR item IN SELECT id FROM public.finance_revenue_revisions WHERE cycle_id=s.id LOOP PERFORM public.validate_revenue_revision_graph(item.id);END LOOP;
 FOR item IN SELECT id FROM public.finance_revenue_supplements WHERE cycle_id=s.id LOOP PERFORM public.validate_revenue_supplement_graph(item.id);END LOOP;
 FOR item IN SELECT id FROM public.finance_customer_credits WHERE invoice_id IN (SELECT public.revenue_cycle_invoices(s.id)) LOOP PERFORM public.validate_customer_credit_graph(item.id);END LOOP;
 FOR item IN SELECT * FROM public.finance_revenue_entries WHERE cycle_id=s.id LOOP
  SELECT * INTO q FROM public.finance_requests WHERE id=item.request_id;
  IF q.org_id IS DISTINCT FROM c.org_id OR q.entity_id IS DISTINCT FROM c.entity_id OR q.kind IS DISTINCT FROM 'CONTRACT_RECOGNIZE' OR q.state NOT IN ('EXECUTING','APPROVED') OR q.requested_by=q.decided_by OR q.payload->>'cycle_id' IS DISTINCT FROM s.id::text OR (q.payload->>'as_of')::date IS DISTINCT FROM item.as_of OR q.payload->'evidence' IS DISTINCT FROM item.evidence THEN RAISE EXCEPTION 'revised recognition approval graph is invalid';END IF;
  SELECT value INTO history FROM jsonb_array_elements(q.source_snapshot->'billing_cycles') WHERE (value->>'cycle')::int=s.cycle_number;
  earned:=history->'earned_at_proposed_date';expected:='[]';
  IF jsonb_typeof(earned) IS DISTINCT FROM 'array' OR jsonb_array_length(earned)<>jsonb_array_length(s.allocations) THEN RAISE EXCEPTION 'retained earned-service evidence is unavailable';END IF;
  FOR allocation IN SELECT value FROM jsonb_array_elements(earned) LOOP
   SELECT coalesce(sum((a->>'amount')::numeric),0) INTO prior FROM jsonb_array_elements(history->'recognized') e CROSS JOIN LATERAL jsonb_array_elements(e->'allocations') a WHERE a->>'key'=allocation->>'key';
   delta:=(allocation->>'amount')::numeric-prior;IF delta<0 THEN RAISE EXCEPTION 'ordinary recognition contains an unapproved negative adjustment';END IF;
   expected:=expected||jsonb_build_array(jsonb_build_object('key',allocation->>'key','amount',delta::numeric(38,2)::text));
  END LOOP;
  IF expected IS DISTINCT FROM item.allocations OR (SELECT sum((a->>'amount')::numeric) FROM jsonb_array_elements(expected) a) IS DISTINCT FROM item.amount THEN RAISE EXCEPTION 'revised recognition exceeds retained earned service';END IF;
  IF q.source_snapshot?'revisionState' THEN
   balances:=q.source_snapshot->'revisionState'->'before';PERFORM public.assert_finance_journal(item.journal_id,c.org_id,c.entity_id,item.as_of,public.revenue_change_lines(s.id,balances,(balances->>'recognized')::numeric+item.amount));
   IF item.transfer_journal IS NOT NULL THEN RAISE EXCEPTION 'revised recognition has an unexpected transfer';END IF;
  ELSIF EXISTS(SELECT 1 FROM public.journal_lines WHERE journal_entry_id=item.journal_id AND account_id=unbilled AND debit=item.amount) THEN
   PERFORM public.assert_contract_journal(item.journal_id,c.entity_id,item.as_of,unbilled,revenue,item.amount);
   IF item.transfer_journal IS NOT NULL THEN PERFORM public.assert_contract_journal(item.transfer_journal,c.entity_id,s.invoice_date,deferred,unbilled,item.amount);END IF;
  ELSE PERFORM public.assert_contract_journal(item.journal_id,c.entity_id,item.as_of,deferred,revenue,item.amount);END IF;
 END LOOP;
 FOR day IN SELECT entry_date AS date FROM public.journal_entries WHERE id IN (SELECT public.revenue_owned_journals(s.id)) UNION SELECT as_of FROM public.finance_revenue_revisions WHERE cycle_id=s.id LOOP
  balances:=public.revenue_cycle_balances(s.id,day.date);
  IF (balances->>'billed')::numeric<0 OR (balances->>'recognized')::numeric<0 OR (balances->>'recognized')::numeric>public.revenue_gross_price(s.id,day.date)-(public.revenue_credit_totals(s.id,day.date)->>'amount')::numeric THEN RAISE EXCEPTION 'dated revised revenue exceeds approved consideration';END IF;
  SELECT coalesce(sum(l.credit-l.debit) FILTER(WHERE l.account_id=deferred),0),coalesce(sum(l.debit-l.credit) FILTER(WHERE l.account_id=unbilled),0) INTO gl_d,gl_u FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.id IN (SELECT public.revenue_owned_journals(s.id)) AND j.entry_date<=day.date;
  IF gl_d<>(balances->>'deferred')::numeric OR gl_u<>(balances->>'unbilled')::numeric THEN RAISE EXCEPTION 'dated revised revenue and unbilled/deferred journals do not reconcile';END IF;
 END LOOP;
END; $$;

-- Existing readers include the signed revision movements.
CREATE OR REPLACE FUNCTION public.concession_credit_preview(p_entity uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_org uuid:=public.get_user_org_id();v_i public.invoices%ROWTYPE;v_policy public.finance_customer_credit_controls%ROWTYPE;
 v_cycle public.finance_contract_cycles%ROWTYPE;v_contract public.finance_contracts%ROWTYPE;v_line record;v_o jsonb;v_item jsonb;
 v_total numeric:=0;v_amount numeric;v_remaining numeric;v_ar numeric;v_balance numeric;v_allocated numeric:=0;v_cumulative numeric:=0;
 v_price numeric;v_rec numeric;v_prior numeric;v_rec_part numeric;v_revenue_part numeric:=0;v_deferred_part numeric:=0;
 v_date date:=(p_payload->>'date')::date;v_lines jsonb:='[]';v_obligations jsonb:='[]';v_journal jsonb:='[]';v_seen uuid[]:='{}';v_ar_account uuid;
v_revised_balances jsonb;v_revised_unbilled numeric:=0;
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
 SELECT * INTO v_cycle FROM public.finance_contract_cycles WHERE v_i.id IN (SELECT public.revenue_cycle_invoices(id));
 IF v_cycle.id IS NOT NULL THEN
  SELECT * INTO v_contract FROM public.finance_contracts WHERE id=v_cycle.contract_id;
  IF EXISTS(SELECT 1 FROM public.finance_revenue_movements WHERE cycle_id=v_cycle.id AND as_of>v_date) THEN RAISE EXCEPTION 'credit must follow recognized contract history'; END IF;
  SELECT public.revenue_gross_price(v_cycle.id,v_date)-coalesce(sum(public.customer_credit_net(lines)),0) INTO v_remaining FROM public.finance_customer_credits WHERE invoice_id IN (SELECT public.revenue_cycle_invoices(v_cycle.id)) AND reversal_date IS NULL;
  FOR v_o IN SELECT value FROM jsonb_array_elements(public.revenue_allocation_basis(v_cycle.id,v_date)) LOOP
   SELECT coalesce(sum((a->>'amount')::numeric),0),coalesce(sum((a->>'recognized')::numeric),0) INTO v_prior,v_rec_part
    FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.obligations) a WHERE c.invoice_id IN (SELECT public.revenue_cycle_invoices(v_cycle.id)) AND c.reversal_date IS NULL AND a->>'key'=v_o->>'key';
   v_price:=(v_o->>'amount')::numeric-v_prior;
   SELECT coalesce(sum((a->>'amount')::numeric),0)-v_rec_part INTO v_rec FROM public.finance_revenue_movements e CROSS JOIN LATERAL jsonb_array_elements(e.allocations) a WHERE e.cycle_id=v_cycle.id AND a->>'key'=v_o->>'key';
   v_cumulative:=v_cumulative+v_price;v_amount:=round(v_total*v_cumulative/v_remaining,2)-v_allocated;v_allocated:=v_allocated+v_amount;
   v_rec_part:=CASE WHEN v_price=0 THEN 0 ELSE round(v_amount*v_rec/v_price,2) END;
   v_revenue_part:=v_revenue_part+v_rec_part;v_deferred_part:=v_deferred_part+v_amount-v_rec_part;
   v_obligations:=v_obligations||jsonb_build_array(jsonb_build_object('key',v_o->>'key','amount',round(v_amount,2)::text,'recognized',round(v_rec_part,2)::text));
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.finance_revenue_revisions WHERE cycle_id=v_cycle.id) THEN
   v_revised_balances:=public.revenue_cycle_balances(v_cycle.id,v_date);
   v_deferred_part:=(v_revised_balances->>'deferred')::numeric-greatest((v_revised_balances->>'billed')::numeric-v_total-((v_revised_balances->>'recognized')::numeric-v_revenue_part),0);
   v_revised_unbilled:=greatest((v_revised_balances->>'recognized')::numeric-v_revenue_part-((v_revised_balances->>'billed')::numeric-v_total),0)-(v_revised_balances->>'unbilled')::numeric;
   IF v_revised_unbilled>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_contract.terms->>'unbilled_account_id','debit',round(v_revised_unbilled,2)::text,'credit','0.00'));END IF;
  END IF;
  IF v_revenue_part>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_lines->0->>'revenueAccountId','debit',round(v_revenue_part,2)::text,'credit','0.00')); END IF;
  IF v_deferred_part>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_contract.terms->>'deferred_account_id','debit',round(v_deferred_part,2)::text,'credit','0.00')); END IF;
 ELSE
  SELECT jsonb_agg(jsonb_build_object('account_id',account,'debit',round(amount,2)::text,'credit','0.00') ORDER BY account) INTO v_journal
   FROM (SELECT a->>'revenueAccountId' AS account,sum((a->>'amount')::numeric) AS amount FROM jsonb_array_elements(v_lines) a GROUP BY 1) x;
 END IF;
 IF v_ar>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_ar_account,'debit','0.00','credit',round(v_ar,2)::text)); END IF;
 IF v_balance>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_policy.liability_account_id,'debit','0.00','credit',round(v_balance,2)::text)); END IF;
 RETURN jsonb_build_object('invoiceId',v_i.id,'customerId',v_i.customer_id,'controlId',v_policy.id,'amount',round(v_total,2)::text,'arAmount',round(v_ar,2)::text,'balanceAmount',round(v_balance,2)::text,'lines',v_lines,'obligations',v_obligations,'journalLines',v_journal);
END; $function$
;

CREATE OR REPLACE FUNCTION public.tax_credit_preview(p_entity uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_org uuid:=public.get_user_org_id();v_i public.invoices%ROWTYPE;v_policy public.finance_customer_credit_controls%ROWTYPE;
 v_cycle public.finance_contract_cycles%ROWTYPE;v_contract public.finance_contracts%ROWTYPE;v_line record;v_o jsonb;v_item jsonb;
 v_total numeric:=0;v_amount numeric;v_remaining numeric;v_ar numeric;v_balance numeric;v_allocated numeric:=0;v_cumulative numeric:=0;
 v_price numeric;v_rec numeric;v_prior numeric;v_rec_part numeric;v_revenue_part numeric:=0;v_deferred_part numeric:=0;
 v_tax_total numeric:=0;v_tax_line numeric;v_tax_parts jsonb;v_prior_net numeric;v_tax public.finance_tax_documents%ROWTYPE;
 v_date date:=(p_payload->>'date')::date;v_lines jsonb:='[]';v_obligations jsonb:='[]';v_journal jsonb:='[]';v_seen uuid[]:='{}';v_ar_account uuid;
v_revised_balances jsonb;v_revised_unbilled numeric:=0;
BEGIN
 SELECT * INTO v_i FROM public.invoices WHERE id=(p_payload->>'invoice_id')::uuid AND entity_id=p_entity AND org_id=v_org AND accounting_status='POSTED';
 IF v_i.id IS NULL THEN RAISE EXCEPTION 'posted customer invoice unavailable'; END IF;
 SELECT * INTO v_tax FROM public.finance_tax_documents WHERE invoice_id=v_i.id;
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
  SELECT v_line.line_total-coalesce(sum(coalesce(a->>'netAmount',a->>'amount')::numeric),0) INTO v_remaining FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.lines) a
   WHERE c.invoice_id=v_i.id AND c.reversal_date IS NULL AND a->>'lineId'=v_line.id::text;
  IF v_amount<=0 OR v_amount>v_remaining THEN RAISE EXCEPTION 'credit exceeds the uncredited original invoice line'; END IF;
  v_total:=v_total+v_amount;v_seen:=array_append(v_seen,v_line.id);
  SELECT public.tax_credit_components(v_tax.id,v_line.id,v_amount,(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM public.finance_customer_credits c WHERE c.invoice_id=v_i.id)) INTO v_tax_parts;
  SELECT coalesce(sum((a->>'amount')::numeric),0) INTO v_tax_line FROM jsonb_array_elements(v_tax_parts) a;
  v_tax_total:=v_tax_total+v_tax_line;
  v_lines:=v_lines||jsonb_build_array(jsonb_build_object('lineId',v_line.id,'description',v_line.description,'amount',round(v_amount+v_tax_line,2)::text,'netAmount',round(v_amount,2)::text,'taxAmount',round(v_tax_line,2)::text,'taxComponents',v_tax_parts,'revenueAccountId',v_line.revenue_account_id));
 END LOOP;
 SELECT ar_account_id INTO v_ar_account FROM public.entity_invoice_account_controls WHERE id=v_i.account_control_id;
 v_ar:=least(v_total+v_tax_total,public.customer_invoice_remaining(v_i.id,v_date));v_balance:=v_total+v_tax_total-v_ar;
 SELECT * INTO v_cycle FROM public.finance_contract_cycles WHERE v_i.id IN (SELECT public.revenue_cycle_invoices(id));
 IF v_cycle.id IS NOT NULL THEN
  SELECT * INTO v_contract FROM public.finance_contracts WHERE id=v_cycle.contract_id;
  IF EXISTS(SELECT 1 FROM public.finance_revenue_movements WHERE cycle_id=v_cycle.id AND as_of>v_date) THEN RAISE EXCEPTION 'credit must follow recognized contract history'; END IF;
  SELECT public.revenue_gross_price(v_cycle.id,v_date)-coalesce(sum(public.customer_credit_net(lines)),0) INTO v_remaining FROM public.finance_customer_credits WHERE invoice_id IN (SELECT public.revenue_cycle_invoices(v_cycle.id)) AND reversal_date IS NULL;
  FOR v_o IN SELECT value FROM jsonb_array_elements(public.revenue_allocation_basis(v_cycle.id,v_date)) LOOP
   SELECT coalesce(sum((a->>'amount')::numeric),0),coalesce(sum((a->>'recognized')::numeric),0) INTO v_prior,v_rec_part
    FROM public.finance_customer_credits c CROSS JOIN LATERAL jsonb_array_elements(c.obligations) a WHERE c.invoice_id IN (SELECT public.revenue_cycle_invoices(v_cycle.id)) AND c.reversal_date IS NULL AND a->>'key'=v_o->>'key';
   v_price:=(v_o->>'amount')::numeric-v_prior;
   SELECT coalesce(sum((a->>'amount')::numeric),0)-v_rec_part INTO v_rec FROM public.finance_revenue_movements e CROSS JOIN LATERAL jsonb_array_elements(e.allocations) a WHERE e.cycle_id=v_cycle.id AND a->>'key'=v_o->>'key';
   v_cumulative:=v_cumulative+v_price;v_amount:=round(v_total*v_cumulative/v_remaining,2)-v_allocated;v_allocated:=v_allocated+v_amount;
   v_rec_part:=CASE WHEN v_price=0 THEN 0 ELSE round(v_amount*v_rec/v_price,2) END;
   v_revenue_part:=v_revenue_part+v_rec_part;v_deferred_part:=v_deferred_part+v_amount-v_rec_part;
   v_obligations:=v_obligations||jsonb_build_array(jsonb_build_object('key',v_o->>'key','amount',round(v_amount,2)::text,'recognized',round(v_rec_part,2)::text));
  END LOOP;
  IF EXISTS(SELECT 1 FROM public.finance_revenue_revisions WHERE cycle_id=v_cycle.id) THEN
   v_revised_balances:=public.revenue_cycle_balances(v_cycle.id,v_date);
   v_deferred_part:=(v_revised_balances->>'deferred')::numeric-greatest((v_revised_balances->>'billed')::numeric-v_total-((v_revised_balances->>'recognized')::numeric-v_revenue_part),0);
   v_revised_unbilled:=greatest((v_revised_balances->>'recognized')::numeric-v_revenue_part-((v_revised_balances->>'billed')::numeric-v_total),0)-(v_revised_balances->>'unbilled')::numeric;
   IF v_revised_unbilled>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_contract.terms->>'unbilled_account_id','debit',round(v_revised_unbilled,2)::text,'credit','0.00'));END IF;
  END IF;
  IF v_revenue_part>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_lines->0->>'revenueAccountId','debit',round(v_revenue_part,2)::text,'credit','0.00')); END IF;
  IF v_deferred_part>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_contract.terms->>'deferred_account_id','debit',round(v_deferred_part,2)::text,'credit','0.00')); END IF;
 ELSE
  SELECT jsonb_agg(jsonb_build_object('account_id',account,'debit',round(amount,2)::text,'credit','0.00') ORDER BY account) INTO v_journal
   FROM (SELECT a->>'revenueAccountId' AS account,sum((a->>'netAmount')::numeric) AS amount FROM jsonb_array_elements(v_lines) a GROUP BY 1) x;
 END IF;
 IF v_tax_total>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',(SELECT sales_account FROM public.finance_tax_policies WHERE id=v_tax.policy_id),'debit',round(v_tax_total,2)::text,'credit','0.00'));END IF;
 IF v_ar>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_ar_account,'debit','0.00','credit',round(v_ar,2)::text)); END IF;
 IF v_balance>0 THEN v_journal:=v_journal||jsonb_build_array(jsonb_build_object('account_id',v_policy.liability_account_id,'debit','0.00','credit',round(v_balance,2)::text)); END IF;
 RETURN jsonb_build_object('invoiceId',v_i.id,'customerId',v_i.customer_id,'controlId',v_policy.id,'amount',round(v_total+v_tax_total,2)::text,'arAmount',round(v_ar,2)::text,'balanceAmount',round(v_balance,2)::text,'lines',v_lines,'obligations',v_obligations,'journalLines',v_journal);
END; $function$
;

CREATE OR REPLACE FUNCTION public.contract_source_snapshot(p_entity uuid, p_kind text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_result jsonb;
BEGIN
 IF p_kind NOT IN ('CONTRACT_AMEND','CONTRACT_USAGE_CLOSE','CONTRACT_BILL','CONTRACT_RECOGNIZE','CONTRACT_CREDIT') THEN RETURN '{}'::jsonb; END IF;
 SELECT jsonb_agg(jsonb_build_object('contract',c.reference,'cycle',s.cycle_number,'service_starts',s.starts_on,'service_ends',s.ends_on,'cycle_price',s.price::text,'allocations',s.allocations,
  'invoice',s.invoice_id,'invoice_date',s.invoice_date,'billing_request',s.billing_request,'credit',s.credit_id,'cancelled',s.cancel_request IS NOT NULL,
  'usage',public.contract_usage_snapshot(s.id),'usage_finalized',s.usage_finalized,
  'recognized',coalesce((SELECT jsonb_agg(jsonb_build_object('date',as_of,'amount',amount::text,'allocations',allocations,'evidence',evidence) ORDER BY as_of,id) FROM public.finance_revenue_movements WHERE cycle_id=s.id),'[]'::jsonb),
  'earned_at_proposed_date',CASE WHEN p_kind='CONTRACT_RECOGNIZE' THEN public.contract_earned(s.id,(p_payload->>'as_of')::date,p_payload->'evidence') END) ORDER BY s.cycle_number)
  INTO v_result FROM public.finance_contract_cycles s JOIN public.finance_contracts c ON c.id=s.contract_id
  WHERE c.entity_id=p_entity AND c.org_id=public.get_user_org_id() AND
   CASE WHEN p_kind='CONTRACT_AMEND' THEN c.id=(p_payload->>'contract_id')::uuid AND s.cycle_number>=(p_payload->>'effective_cycle')::int ELSE s.id=(p_payload->>'cycle_id')::uuid END;
 IF v_result IS NULL THEN RAISE EXCEPTION 'approval source unavailable'; END IF;
 RETURN jsonb_build_object('billing_cycles',v_result);
END; $function$
;

CREATE OR REPLACE FUNCTION public.customer_source_snapshot(p_entity uuid, p_kind text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  'recognitions',coalesce((SELECT jsonb_agg(to_jsonb(e) ORDER BY e.id) FROM public.finance_revenue_movements e JOIN public.finance_contract_cycles s ON s.id=e.cycle_id WHERE s.invoice_id=i.id),'[]'),
  'targetInvoice',CASE WHEN p_kind='CUSTOMER_CREDIT_APPLY' THEN jsonb_build_object('id',p_payload->>'invoice_id','remaining',public.customer_invoice_remaining((p_payload->>'invoice_id')::uuid,(p_payload->>'date')::date)::numeric(38,2)::text) END)
 INTO v_result FROM public.invoices i WHERE i.id=v_invoice;
 IF p_kind='CUSTOMER_CREDIT' THEN v_result:=v_result||jsonb_build_object('creditPreview',public.customer_credit_preview(p_entity,p_payload)); END IF;
 RETURN v_result;
END; $function$
;

CREATE OR REPLACE FUNCTION public.get_pre_intercompany_close_check(p_entity uuid, p_from date, p_through date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_org uuid:=public.get_user_org_id();v_trial jsonb;v_ar jsonb;v_ap jsonb;v_banks jsonb;v_assets jsonb;v_revenue jsonb;v_periods jsonb;v_s public.finance_schedules%ROWTYPE;v_cycle record;
 v_pending_schedules integer:=0;v_pending_usage integer:=0;v_unrecognized numeric:=0;v_earned numeric;v_recorded numeric;v_unresolved integer;v_pending_requests integer;v_missing_cash integer;v_can boolean;v_result jsonb;
BEGIN
 v_trial:=public.get_entity_trial_balance(p_entity,p_from,p_through)-'generatedAt';
 IF p_through>CURRENT_DATE THEN RAISE EXCEPTION 'a future period cannot be accepted as closed'; END IF;
 IF EXISTS(SELECT 1 FROM public.entity_invoice_account_controls WHERE entity_id=p_entity AND org_id=v_org) THEN v_ar:=public.get_subledger_aging(p_entity,'ar',p_through,0,1,NULL)-'generatedAt'-'rows'; END IF;
 IF EXISTS(SELECT 1 FROM public.entity_supplier_bill_account_controls WHERE entity_id=p_entity AND org_id=v_org) THEN v_ap:=public.get_subledger_aging(p_entity,'ap',p_through,0,1,NULL)-'generatedAt'-'rows'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('registerId',r.id,'name',r.name,'approvedThrough',s.ends_on,'statementId',s.id,'complete',coalesce(s.ends_on>=p_through,false)) ORDER BY r.id),'[]') INTO v_banks
 FROM public.cash_registers r LEFT JOIN LATERAL (SELECT id,ends_on FROM public.cash_statements WHERE register_id=r.id AND status='APPROVED' ORDER BY (ends_on>=p_through) DESC,CASE WHEN ends_on>=p_through THEN ends_on END ASC,ends_on DESC,id LIMIT 1) s ON true WHERE r.entity_id=p_entity AND r.org_id=v_org;
 SELECT count(DISTINCT cash_account) INTO v_missing_cash FROM (
  SELECT cash_account_id AS cash_account FROM public.entity_customer_receipt_controls WHERE entity_id=p_entity
  UNION SELECT cash_account_id FROM public.entity_supplier_payment_controls WHERE entity_id=p_entity
 ) controls WHERE EXISTS(SELECT 1 FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.entity_id=p_entity AND j.status='posted' AND j.entry_date<=p_through AND l.account_id=controls.cash_account)
  AND NOT EXISTS(SELECT 1 FROM public.cash_registers WHERE entity_id=p_entity AND account_id=controls.cash_account);
 v_assets:=public.get_asset_schedule_controls(p_entity,p_through);v_revenue:=public.get_contract_control_balances(p_entity,p_through);
 FOR v_s IN SELECT * FROM public.finance_schedules WHERE entity_id=p_entity AND org_id=v_org AND state='ACTIVE' LOOP
  IF v_s.kind IN ('PREPAID','FIXED_ASSET') THEN
   IF public.schedule_earned(v_s,p_through)>public.schedule_expensed(v_s.id,p_through) THEN v_pending_schedules:=v_pending_schedules+1; END IF;
  ELSE SELECT v_pending_schedules+count(*) INTO v_pending_schedules FROM public.schedule_pending_dates(v_s,p_through); END IF;
 END LOOP;
 FOR v_cycle IN SELECT s.*,c.terms FROM public.finance_contract_cycles s JOIN public.finance_contracts c ON c.id=s.contract_id WHERE c.entity_id=p_entity AND c.org_id=v_org AND s.starts_on<=p_through AND s.cancel_request IS NULL AND (s.credit_date IS NULL OR s.credit_date>p_through) LOOP
  IF NOT v_cycle.usage_finalized THEN
   IF v_cycle.ends_on<=p_through THEN v_pending_usage:=v_pending_usage+1; END IF;
  ELSE
   SELECT coalesce(sum((value->>'amount')::numeric),0) INTO v_earned FROM jsonb_array_elements(public.contract_earned(v_cycle.id,least(p_through,v_cycle.ends_on),'[]'));
   SELECT coalesce(sum(amount),0) INTO v_recorded FROM public.finance_revenue_movements WHERE cycle_id=v_cycle.id AND as_of<=p_through;
   v_unrecognized:=v_unrecognized+greatest(v_earned-v_recorded,0);
  END IF;
 END LOOP;
 SELECT count(*) INTO v_unresolved FROM public.finance_inbox i JOIN public.finance_connections c ON c.id=i.connection_id WHERE c.entity_id=p_entity AND i.state='RECEIVED' AND
  coalesce((i.source->>'date')::date,((i.source->>'occurred_at')::timestamptz AT TIME ZONE c.timezone)::date,i.received_at::date)<=p_through;
 SELECT count(*) INTO v_pending_requests FROM public.finance_requests WHERE entity_id=p_entity AND org_id=v_org AND state='PENDING' AND kind NOT IN ('PERIOD_REVIEW','FISCAL_YEAR_CLOSE','FISCAL_YEAR_REOPEN','GROUP_CREATE','GROUP_ADJUSTMENT','GROUP_ADJUSTMENT_REVERSE','GROUP_CONSOLIDATE','GROUP_REOPEN');
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'startsOn',period_start,'endsOn',period_end,'status',status,'version',version) ORDER BY period_start,id),'[]') INTO v_periods FROM public.accounting_periods WHERE entity_id=p_entity AND org_id=v_org AND period_start<=p_through AND period_end>=p_from;
 v_can:=coalesce((v_ar->>'reconciled')::boolean,true) AND coalesce((v_ap->>'reconciled')::boolean,true) AND (v_trial->>'draftJournalCount')::integer=0 AND v_missing_cash=0
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_banks) b WHERE NOT (b->>'complete')::boolean)
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_assets||v_revenue) b WHERE (b->>'variance')::numeric<>0)
  AND v_pending_schedules=0 AND v_pending_usage=0 AND v_unrecognized=0 AND v_unresolved=0 AND v_pending_requests=0;
 v_result:=jsonb_build_object('entityId',p_entity,'from',p_from,'through',p_through,'trialBalance',v_trial,'ar',v_ar,'ap',v_ap,'banks',v_banks,'assetControls',v_assets,'revenueControls',v_revenue,'periods',v_periods,
  'unregisteredCashAccounts',v_missing_cash,'pendingSchedules',v_pending_schedules,'unfinalizedUsage',v_pending_usage,'unrecognizedRevenue',round(v_unrecognized,2)::text,'unresolvedProviderEvents',v_unresolved,'pendingFinanceRequests',v_pending_requests,'canClose',v_can);
 RETURN v_result||jsonb_build_object('revision',md5(v_result::text),'generatedAt',statement_timestamp());
END; $function$
;

CREATE OR REPLACE FUNCTION public.guard_contract_journal_reversal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
 IF NEW.reversal_of_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE NEW.reversal_of_id IN (deferral_journal,unbilled_transfer_journal,credit_journal)) OR
  EXISTS(SELECT 1 FROM public.finance_revenue_movements WHERE NEW.reversal_of_id IN (journal_id,transfer_journal))) THEN RAISE EXCEPTION 'contract journals must be corrected through the contract workflow'; END IF;
 RETURN NEW;
END; $function$
;

CREATE OR REPLACE FUNCTION public.get_contract_control_balances(p_entity_id uuid, p_as_of date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_org uuid:=public.get_user_org_id();v_result jsonb;v_contract record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity_id AND org_id=v_org) OR p_as_of IS NULL OR p_as_of NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' THEN RAISE EXCEPTION 'contract control scope unavailable'; END IF;
 PERFORM public.get_entity_trial_balance(p_entity_id,DATE '0001-01-01',p_as_of);
 FOR v_contract IN SELECT id FROM public.finance_contracts WHERE entity_id=p_entity_id AND org_id=v_org LOOP PERFORM public.validate_contract_graph(v_contract.id); END LOOP;
 FOR v_contract IN SELECT id FROM public.finance_customer_credits WHERE entity_id=p_entity_id AND org_id=v_org LOOP PERFORM public.validate_customer_credit_graph(v_contract.id); END LOOP;
 WITH cycles AS (
  SELECT c.terms,s.*,CASE WHEN EXISTS(SELECT 1 FROM public.finance_revenue_revisions WHERE cycle_id=s.id) THEN (public.revenue_cycle_balances(s.id,p_as_of)->>'recognized')::numeric WHEN s.credit_date<=p_as_of THEN 0 ELSE coalesce((SELECT sum(amount) FROM public.finance_revenue_movements WHERE cycle_id=s.id AND as_of<=p_as_of),0)-(SELECT coalesce(sum((a->>'recognized')::numeric),0) FROM public.finance_customer_credits cr CROSS JOIN LATERAL jsonb_array_elements(cr.obligations) a WHERE cr.invoice_id=s.invoice_id AND cr.as_of<=p_as_of AND (cr.reversal_date IS NULL OR cr.reversal_date>p_as_of)) END AS earned,
   CASE WHEN EXISTS(SELECT 1 FROM public.finance_revenue_revisions WHERE cycle_id=s.id) THEN (public.revenue_cycle_balances(s.id,p_as_of)->>'billed')::numeric WHEN s.credit_date<=p_as_of THEN 0 WHEN s.invoice_id IS NOT NULL AND s.invoice_date<=p_as_of THEN s.price-(SELECT coalesce(sum(public.customer_credit_net(cr.lines)),0) FROM public.finance_customer_credits cr WHERE cr.invoice_id=s.invoice_id AND cr.as_of<=p_as_of AND (cr.reversal_date IS NULL OR cr.reversal_date>p_as_of)) ELSE 0 END AS billed
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
END; $function$
;

CREATE OR REPLACE FUNCTION public.get_contract_finance(p_contract_id uuid, p_as_of date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_org uuid:=public.get_user_org_id();v_c public.finance_contracts%ROWTYPE;v_cycle record;v_rows jsonb:='[]';v_billed numeric:=0;v_recognized numeric:=0;v_b numeric;v_r numeric;v_deferred numeric:=0;v_unbilled numeric:=0;v_schedule jsonb;
BEGIN
 SELECT * INTO v_c FROM public.finance_contracts WHERE id=p_contract_id AND org_id=v_org;
 IF v_c.id IS NULL THEN RAISE EXCEPTION 'contract unavailable'; END IF;
 IF p_as_of IS NULL OR p_as_of NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' THEN RAISE EXCEPTION 'invalid contract report date'; END IF;
 PERFORM public.validate_contract_graph(v_c.id);
 PERFORM public.get_entity_trial_balance(v_c.entity_id,DATE '0001-01-01',p_as_of);
 FOR v_cycle IN SELECT * FROM public.finance_contract_cycles WHERE contract_id=v_c.id ORDER BY cycle_number LOOP
  SELECT coalesce(sum(amount),0) INTO v_r FROM public.finance_revenue_movements WHERE cycle_id=v_cycle.id AND as_of<=p_as_of;
  v_b:=CASE WHEN v_cycle.invoice_id IS NOT NULL AND v_cycle.invoice_date<=p_as_of THEN v_cycle.price ELSE 0 END;
  IF v_cycle.credit_date<=p_as_of THEN v_b:=0;v_r:=0; END IF;
  v_b:=v_b-(SELECT coalesce(sum(public.customer_credit_net(cr.lines)),0) FROM public.finance_customer_credits cr WHERE cr.invoice_id=v_cycle.invoice_id AND cr.as_of<=p_as_of AND (cr.reversal_date IS NULL OR cr.reversal_date>p_as_of));
  v_r:=v_r-(SELECT coalesce(sum((a->>'recognized')::numeric),0) FROM public.finance_customer_credits cr CROSS JOIN LATERAL jsonb_array_elements(cr.obligations) a WHERE cr.invoice_id=v_cycle.invoice_id AND cr.as_of<=p_as_of AND (cr.reversal_date IS NULL OR cr.reversal_date>p_as_of));
  IF EXISTS(SELECT 1 FROM public.finance_revenue_revisions WHERE cycle_id=v_cycle.id) THEN v_b:=(public.revenue_cycle_balances(v_cycle.id,p_as_of)->>'billed')::numeric;v_r:=(public.revenue_cycle_balances(v_cycle.id,p_as_of)->>'recognized')::numeric;END IF;
  v_billed:=v_billed+v_b;v_recognized:=v_recognized+v_r;v_deferred:=v_deferred+greatest(v_b-v_r,0);v_unbilled:=v_unbilled+greatest(v_r-v_b,0);
  SELECT coalesce(jsonb_agg(jsonb_build_object('through',month_end,'cumulativeEarned',CASE WHEN v_cycle.usage_finalized THEN public.contract_net_earned(v_cycle.id,month_end,'[]') ELSE NULL END) ORDER BY month_end),'[]') INTO v_schedule
   FROM (SELECT least((date_trunc('month',d)+INTERVAL '1 month - 1 day')::date,v_cycle.ends_on) AS month_end FROM generate_series(date_trunc('month',v_cycle.starts_on::timestamp),date_trunc('month',v_cycle.ends_on::timestamp),INTERVAL '1 month') d) m;
  v_rows:=v_rows||jsonb_build_array(jsonb_build_object('id',v_cycle.id,'number',v_cycle.cycle_number,'startsOn',v_cycle.starts_on,'endsOn',v_cycle.ends_on,'price',(public.revenue_gross_price(v_cycle.id,p_as_of)-(public.revenue_credit_totals(v_cycle.id,p_as_of)->>'amount')::numeric)::numeric(38,2)::text,'originalPrice',v_cycle.price::text,'revisions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'version',version,'date',as_of,'price',price::text,'plan',plan,'amount',amount::text,'journalId',journal_id,'requestId',request_id) ORDER BY version) FROM public.finance_revenue_revisions WHERE cycle_id=v_cycle.id),'[]'),'supplements',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'date',as_of,'amount',amount::text,'invoiceId',invoice_id,'requestId',request_id) ORDER BY as_of,id) FROM public.finance_revenue_supplements WHERE cycle_id=v_cycle.id),'[]'),'allocations',v_cycle.allocations,
   'usageFinalized',v_cycle.usage_finalized,'usage',public.contract_usage_snapshot(v_cycle.id),'invoiceId',v_cycle.invoice_id,'invoiceDate',v_cycle.invoice_date,'billingRequest',v_cycle.billing_request,'creditId',v_cycle.credit_id,'cancelled',v_cycle.cancel_request IS NOT NULL,
   'billed',round(v_b,2)::text,'recognized',round(v_r,2)::text,'deferred',round(greatest(v_b-v_r,0),2)::text,'unbilled',round(greatest(v_r-v_b,0),2)::text,'schedule',v_schedule,
   'recognitions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'date',as_of,'amount',amount::text,'allocations',allocations,'journalId',journal_id,'evidence',evidence,'kind',movement_kind) ORDER BY as_of,id) FROM public.finance_revenue_movements WHERE cycle_id=v_cycle.id),'[]'::jsonb)));
 END LOOP;
 RETURN jsonb_build_object('id',v_c.id,'reference',v_c.reference,'entityId',v_c.entity_id,'customerId',v_c.customer_id,'currency',v_c.currency,'terms',v_c.terms,'asOf',p_as_of,'billed',round(v_billed,2)::text,'recognized',round(v_recognized,2)::text,'deferred',round(v_deferred,2)::text,'unbilled',round(v_unbilled,2)::text,'cycles',v_rows,'controls',public.get_contract_control_balances(v_c.entity_id,p_as_of));
END; $function$
;

CREATE OR REPLACE FUNCTION public.validate_contract_graph(p_contract uuid, p_cycle_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_c public.finance_contracts%ROWTYPE;v_cycle record;v_entry record;v_day record;v_revenue uuid;v_deferred uuid;v_unbilled uuid;v_total numeric;v_before numeric;v_bill numeric;v_rec numeric;v_gl_deferred numeric;v_gl_unbilled numeric;
BEGIN
 SELECT * INTO v_c FROM public.finance_contracts WHERE id=p_contract;
 IF v_c.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.entities WHERE id=v_c.entity_id AND org_id=v_c.org_id AND currency=v_c.currency) OR
  NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_c.creation_request AND org_id=v_c.org_id AND entity_id=v_c.entity_id AND kind='CONTRACT_CREATE' AND payload=v_c.terms AND state IN ('APPROVED','EXECUTING')) THEN RAISE EXCEPTION 'contract approval graph is invalid'; END IF;
 SELECT revenue_account_id INTO v_revenue FROM public.entity_invoice_account_controls WHERE entity_id=v_c.entity_id;
 v_deferred:=(v_c.terms->>'deferred_account_id')::uuid;v_unbilled:=(v_c.terms->>'unbilled_account_id')::uuid;
 FOR v_cycle IN SELECT * FROM public.finance_contract_cycles WHERE contract_id=v_c.id AND (p_cycle_id IS NULL OR id=p_cycle_id) LOOP
  IF EXISTS(SELECT 1 FROM public.finance_revenue_revisions WHERE cycle_id=v_cycle.id) THEN PERFORM public.validate_revised_cycle_graph(v_cycle.id);CONTINUE;END IF;
  IF (SELECT coalesce(sum((a->>'amount')::numeric),0) FROM jsonb_array_elements(v_cycle.allocations) a)<>v_cycle.price THEN RAISE EXCEPTION 'contract obligation allocations do not equal the cycle price'; END IF;
  SELECT coalesce(sum(amount),0) INTO v_total FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id;
  IF v_total>v_cycle.price THEN RAISE EXCEPTION 'contract revenue exceeds the transaction price'; END IF;
  IF v_c.terms->>'kind'='USAGE' AND v_cycle.usage_finalized AND (
    (public.contract_usage_snapshot(v_cycle.id)->>'revision') IS DISTINCT FROM v_cycle.usage_revision OR
    (public.contract_usage_snapshot(v_cycle.id)->>'units')::numeric IS DISTINCT FROM v_cycle.usage_units OR
    v_cycle.price<>round(v_cycle.usage_units*(v_c.terms->>'unit_price')::numeric,2)) THEN RAISE EXCEPTION 'finalized usage graph is invalid'; END IF;
  IF v_cycle.invoice_id IS NOT NULL THEN
   PERFORM public.validate_customer_invoice_graph(v_cycle.invoice_id);
   IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=v_cycle.invoice_id AND org_id=v_c.org_id AND entity_id=v_c.entity_id AND customer_id=v_c.customer_id AND subtotal=v_cycle.price AND issue_date=v_cycle.invoice_date) THEN RAISE EXCEPTION 'contract invoice graph is invalid'; END IF;
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
END; $function$
;


CREATE OR REPLACE FUNCTION public.attach_document_tax(p_document uuid,p_kind text,p_lines jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.finance_requests%ROWTYPE;d record;s jsonb;jlines jsonb;bindings jsonb;part record;control uuid;operating uuid;n integer;
BEGIN
 SELECT * INTO r FROM public.finance_requests WHERE id=nullif(current_setting('tapaano.finance_request',true),'')::uuid AND state='EXECUTING' AND decided_by=auth.uid() AND requested_by<>auth.uid();
 IF r.id IS NULL OR r.kind NOT IN ('TAX_INVOICE','TAX_BILL','CONTRACT_BILL','CONTRACT_SUPPLEMENT_BILL') OR NOT r.payload?'tax' THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM public.finance_tax_documents WHERE invoice_id=p_document OR bill_id=p_document) THEN RETURN; END IF;
 IF p_kind='AR' THEN
  SELECT id,org_id,entity_id,issue_date,journal_entry_id,subtotal,posted_by INTO d FROM public.invoices WHERE id=p_document;
  SELECT ar_account_id,revenue_account_id INTO control,operating FROM public.entity_invoice_account_controls WHERE entity_id=r.entity_id;
  SELECT jsonb_agg(jsonb_build_object('id',id,'number',line_number,'net',line_total::text) ORDER BY line_number) INTO bindings FROM public.invoice_lines WHERE invoice_id=p_document;
 ELSE
  SELECT id,org_id,entity_id,issue_date,journal_entry_id,subtotal,posted_by INTO d FROM public.bills WHERE id=p_document;
  SELECT ap_account_id,expense_account_id INTO control,operating FROM public.entity_supplier_bill_account_controls WHERE entity_id=r.entity_id;
  SELECT jsonb_agg(jsonb_build_object('id',id,'number',line_number,'net',line_total::text) ORDER BY line_number) INTO bindings FROM public.bill_lines WHERE bill_id=p_document;
 END IF;
 IF d.org_id IS DISTINCT FROM r.org_id OR d.entity_id IS DISTINCT FROM r.entity_id OR d.posted_by IS DISTINCT FROM auth.uid() OR (p_kind='AP') IS DISTINCT FROM (r.kind='TAX_BILL') THEN RAISE EXCEPTION 'tax document approval ownership mismatch'; END IF;
 s:=public.tax_assessment(r.entity_id,p_kind,d.issue_date,p_lines,r.payload->'tax');
 IF s IS DISTINCT FROM r.source_snapshot->'taxAssessment' OR d.subtotal IS DISTINCT FROM (s->>'subtotal')::numeric THEN RAISE EXCEPTION 'tax source no longer matches its approved assessment'; END IF;
 jlines:=CASE p_kind WHEN 'AR' THEN jsonb_build_array(jsonb_build_object('account_id',control,'debit',s->>'total','credit','0.00'),jsonb_build_object('account_id',operating,'debit','0.00','credit',s->>'subtotal')) ELSE jsonb_build_array(jsonb_build_object('account_id',operating,'debit',s->>'subtotal','credit','0.00'),jsonb_build_object('account_id',control,'debit','0.00','credit',s->>'total')) END;
 FOR part IN SELECT (a->>'account_id')::uuid AS account,sum((a->>'amount')::numeric) AS amount FROM jsonb_array_elements(s->'parts') a WHERE (a->>'amount')::numeric>0 GROUP BY 1 ORDER BY 1 LOOP
  IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=part.account AND org_id=r.org_id AND is_active) THEN RAISE EXCEPTION 'approved tax posting account is inactive'; END IF;
  jlines:=jlines||jsonb_build_array(jsonb_build_object('account_id',part.account,'debit',CASE p_kind WHEN 'AP' THEN round(part.amount,2)::text ELSE '0.00' END,'credit',CASE p_kind WHEN 'AR' THEN round(part.amount,2)::text ELSE '0.00' END));
 END LOOP;
 INSERT INTO public.finance_tax_documents(org_id,entity_id,kind,invoice_id,bill_id,policy_id,request_id,assessment,source_lines,line_bindings,journal_lines,subtotal,tax,total)
  VALUES(r.org_id,r.entity_id,p_kind,CASE WHEN p_kind='AR' THEN d.id END,CASE WHEN p_kind='AP' THEN d.id END,(s->>'policyId')::uuid,r.id,r.payload->'tax',p_lines,bindings,jlines,(s->>'subtotal')::numeric,(s->>'tax')::numeric,(s->>'total')::numeric);
 -- The base posting and these tax lines are one approval transaction; no issued
 -- historical document can enter this path or be retaxed later.
 IF p_kind='AR' THEN UPDATE public.invoices SET tax=(s->>'tax')::numeric,total=(s->>'total')::numeric,functional_total=(s->>'total')::numeric WHERE id=d.id;
 ELSE UPDATE public.bills SET tax=(s->>'tax')::numeric,total=(s->>'total')::numeric,functional_total=(s->>'total')::numeric WHERE id=d.id;END IF;
 UPDATE public.journal_lines SET debit=CASE WHEN p_kind='AR' THEN (s->>'total')::numeric ELSE 0 END,credit=CASE WHEN p_kind='AP' THEN (s->>'total')::numeric ELSE 0 END WHERE journal_entry_id=d.journal_entry_id AND account_id=control;
 n:=2;
 FOR part IN SELECT value FROM jsonb_array_elements(jlines) WITH ORDINALITY a(value,ord) WHERE ord>2 LOOP
  n:=n+1;INSERT INTO public.journal_lines(journal_entry_id,account_id,debit,credit,memo,org_id,entity_id,line_number) VALUES(d.journal_entry_id,(part.value->>'account_id')::uuid,(part.value->>'debit')::numeric,(part.value->>'credit')::numeric,'Assessed tax',r.org_id,r.entity_id,n);
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_document_tax(p_kind text,p_id uuid)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.finance_tax_documents%ROWTYPE;r public.finance_requests%ROWTYPE;d record;s jsonb;bindings jsonb;actual jsonb;expected jsonb;control uuid;operating uuid;part record;jlines jsonb;
BEGIN
 IF p_kind='AR' THEN
  SELECT id,org_id,entity_id,customer_id AS party,invoice_number AS number,issue_date,due_date,notes,subtotal,tax,total,journal_entry_id,accounting_event_id,currency INTO d FROM public.invoices WHERE id=p_id;
  SELECT * INTO t FROM public.finance_tax_documents WHERE invoice_id=p_id;
  SELECT ar_account_id,revenue_account_id INTO control,operating FROM public.entity_invoice_account_controls WHERE entity_id=d.entity_id;
  SELECT jsonb_agg(jsonb_build_object('id',id,'number',line_number,'net',line_total::text) ORDER BY line_number) INTO bindings FROM public.invoice_lines WHERE invoice_id=p_id;
 ELSE
  SELECT id,org_id,entity_id,vendor_id AS party,bill_number AS number,issue_date,due_date,notes,subtotal,tax,total,journal_entry_id,accounting_event_id,currency INTO d FROM public.bills WHERE id=p_id;
  SELECT * INTO t FROM public.finance_tax_documents WHERE bill_id=p_id;
  SELECT ap_account_id,expense_account_id INTO control,operating FROM public.entity_supplier_bill_account_controls WHERE entity_id=d.entity_id;
  SELECT jsonb_agg(jsonb_build_object('id',id,'number',line_number,'net',line_total::text) ORDER BY line_number) INTO bindings FROM public.bill_lines WHERE bill_id=p_id;
 END IF;
 IF t.id IS NULL THEN
  IF d.tax IS DISTINCT FROM 0 THEN RAISE EXCEPTION 'tax-bearing document has no approved assessment'; END IF;RETURN false;
 END IF;
 SELECT * INTO r FROM public.finance_requests WHERE id=t.request_id;
 s:=public.tax_assessment(t.entity_id,t.kind,d.issue_date,t.source_lines,t.assessment);
 IF t.org_id IS DISTINCT FROM d.org_id OR t.entity_id IS DISTINCT FROM d.entity_id OR t.kind IS DISTINCT FROM p_kind OR
  t.subtotal IS DISTINCT FROM d.subtotal OR t.tax IS DISTINCT FROM d.tax OR t.total IS DISTINCT FROM d.total OR t.line_bindings IS DISTINCT FROM bindings OR
  t.policy_id IS DISTINCT FROM (s->>'policyId')::uuid OR t.subtotal IS DISTINCT FROM (s->>'subtotal')::numeric OR t.tax IS DISTINCT FROM (s->>'tax')::numeric OR
  r.id IS NULL OR r.org_id IS DISTINCT FROM t.org_id OR r.entity_id IS DISTINCT FROM t.entity_id OR r.state NOT IN ('EXECUTING','APPROVED') OR r.requested_by=r.decided_by OR
  r.payload->'tax' IS DISTINCT FROM t.assessment OR r.source_snapshot->'taxAssessment' IS DISTINCT FROM s OR
  (p_kind='AP' AND r.kind<>'TAX_BILL') OR (p_kind='AR' AND r.kind NOT IN ('TAX_INVOICE','CONTRACT_BILL','CONTRACT_SUPPLEMENT_BILL')) THEN RAISE EXCEPTION 'tax assessment approval or document graph is invalid'; END IF;
 IF r.kind IN ('TAX_INVOICE','TAX_BILL') AND (r.payload->'lines' IS DISTINCT FROM t.source_lines OR r.payload->>'party_id' IS DISTINCT FROM d.party::text OR r.payload->>'number' IS DISTINCT FROM d.number OR (r.payload->>'date')::date IS DISTINCT FROM d.issue_date OR (r.payload->>'due_date')::date IS DISTINCT FROM d.due_date OR r.payload->>'notes' IS DISTINCT FROM d.notes) THEN RAISE EXCEPTION 'tax document differs from the approved source'; END IF;
 IF r.kind='CONTRACT_SUPPLEMENT_BILL' AND (t.subtotal IS DISTINCT FROM public.cash_amount(r.payload->>'amount') OR t.source_lines IS DISTINCT FROM jsonb_build_array(jsonb_build_object('description',(SELECT c.reference FROM public.finance_contracts c JOIN public.finance_contract_cycles s ON s.contract_id=c.id WHERE s.id=(r.payload->>'cycle_id')::uuid)||' revised consideration','quantity','1','unit_price',t.subtotal::text)) OR (r.state='APPROVED' AND NOT EXISTS(SELECT 1 FROM public.finance_revenue_supplements WHERE invoice_id=p_id AND request_id=r.id))) THEN RAISE EXCEPTION 'tax-bearing supplemental invoice source is invalid';END IF;
 IF r.kind='CONTRACT_BILL' AND NOT EXISTS(SELECT 1 FROM public.finance_contract_cycles WHERE id=(r.payload->>'cycle_id')::uuid AND org_id=t.org_id AND price=t.subtotal AND (invoice_id=p_id OR (invoice_id IS NULL AND r.state='EXECUTING'))) THEN RAISE EXCEPTION 'tax-bearing contract invoice source is invalid'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(t.source_lines) WITH ORDINALITY a(value,ord) FULL JOIN jsonb_array_elements(bindings) b ON (b->>'number')::int=a.ord WHERE a.value IS NULL OR b IS NULL OR round((a.value->>'quantity')::numeric*(a.value->>'unit_price')::numeric,2) IS DISTINCT FROM (b->>'net')::numeric) THEN RAISE EXCEPTION 'tax source lines do not reconcile to the document'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(t.source_lines) WITH ORDINALITY a(value,ord) JOIN (SELECT line_number,description,quantity,unit_price FROM public.invoice_lines WHERE p_kind='AR' AND invoice_id=p_id UNION ALL SELECT line_number,description,quantity,unit_price FROM public.bill_lines WHERE p_kind='AP' AND bill_id=p_id) l ON l.line_number=a.ord WHERE l.description IS DISTINCT FROM a.value->>'description' OR l.quantity IS DISTINCT FROM (a.value->>'quantity')::numeric OR l.unit_price IS DISTINCT FROM (a.value->>'unit_price')::numeric) THEN RAISE EXCEPTION 'assessed document line terms differ from the approved source';END IF;
 jlines:=CASE p_kind WHEN 'AR' THEN jsonb_build_array(jsonb_build_object('account_id',control,'debit',s->>'total','credit','0.00'),jsonb_build_object('account_id',operating,'debit','0.00','credit',s->>'subtotal')) ELSE jsonb_build_array(jsonb_build_object('account_id',operating,'debit',s->>'subtotal','credit','0.00'),jsonb_build_object('account_id',control,'debit','0.00','credit',s->>'total')) END;
 FOR part IN SELECT (a->>'account_id')::uuid AS account,sum((a->>'amount')::numeric) AS amount FROM jsonb_array_elements(s->'parts') a WHERE (a->>'amount')::numeric>0 GROUP BY 1 ORDER BY 1 LOOP
  jlines:=jlines||jsonb_build_array(jsonb_build_object('account_id',part.account,'debit',CASE p_kind WHEN 'AP' THEN round(part.amount,2)::text ELSE '0.00' END,'credit',CASE p_kind WHEN 'AR' THEN round(part.amount,2)::text ELSE '0.00' END));
 END LOOP;
 SELECT jsonb_agg(jsonb_build_array(account_id,debit::numeric,credit::numeric) ORDER BY account_id,debit,credit) INTO actual FROM public.journal_lines WHERE journal_entry_id=d.journal_entry_id;
 SELECT jsonb_agg(jsonb_build_array((a->>'account_id')::uuid,(a->>'debit')::numeric,(a->>'credit')::numeric) ORDER BY (a->>'account_id')::uuid,(a->>'debit')::numeric,(a->>'credit')::numeric) INTO expected FROM jsonb_array_elements(jlines) a;
 IF t.journal_lines IS DISTINCT FROM jlines OR actual IS DISTINCT FROM expected THEN RAISE EXCEPTION 'tax-inclusive journal lines do not reconcile'; END IF;
 RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.tax_request_assessment(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.finance_contract_cycles%ROWTYPE;contract public.finance_contracts%ROWTYPE;lines jsonb;day date;
BEGIN
 IF p_kind='CONTRACT_SUPPLEMENT_BILL' THEN
  SELECT * INTO c FROM public.finance_contract_cycles WHERE id=(p_payload->>'cycle_id')::uuid;SELECT * INTO contract FROM public.finance_contracts WHERE id=c.contract_id AND entity_id=p_entity;
  lines:=jsonb_build_array(jsonb_build_object('description',contract.reference||' revised consideration','quantity','1','unit_price',public.cash_amount(p_payload->>'amount')::numeric(38,2)::text));day:=(p_payload->>'issue_date')::date;
 ELSIF p_kind='CONTRACT_BILL' THEN
  SELECT * INTO c FROM public.finance_contract_cycles WHERE id=(p_payload->>'cycle_id')::uuid;
  SELECT * INTO contract FROM public.finance_contracts WHERE id=c.contract_id AND entity_id=p_entity;
  IF contract.id IS NULL OR c.price<=0 THEN RAISE EXCEPTION 'tax-bearing billing requires a positive finalized cycle'; END IF;
  lines:=jsonb_build_array(jsonb_build_object('description',contract.reference||' cycle '||c.cycle_number,'quantity','1','unit_price',c.price::text));day:=(p_payload->>'issue_date')::date;
 ELSE lines:=p_payload->'lines';day:=(p_payload->>'date')::date;END IF;
 RETURN public.tax_assessment(p_entity,CASE WHEN p_kind='TAX_BILL' THEN 'AP' ELSE 'AR' END,day,lines,p_payload->'tax');
END; $$;


CREATE OR REPLACE FUNCTION public.guard_revenue_revision_sources()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='journal_entries' THEN
  IF NEW.reversal_of_id IS NOT NULL AND (EXISTS(SELECT 1 FROM public.finance_revenue_revisions WHERE journal_id=NEW.reversal_of_id) OR EXISTS(SELECT 1 FROM public.finance_revenue_supplements WHERE NEW.reversal_of_id IN (deferral_journal,transfer_journal))) THEN RAISE EXCEPTION 'correct revised revenue through a subsequent approved revision';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM public.finance_revenue_revisions r WHERE NEW.original_invoice_id IN (SELECT public.revenue_cycle_invoices(r.cycle_id))) THEN RAISE EXCEPTION 'revised revenue invoices use dated customer credit adjustments';END IF;
 END IF;RETURN NEW;
END; $$;
CREATE OR REPLACE FUNCTION public.check_revenue_revision_graph_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cycle uuid;
BEGIN
 IF TG_TABLE_NAME='finance_customer_credits' THEN
  SELECT s.id INTO cycle FROM public.finance_contract_cycles s WHERE NEW.invoice_id IN (SELECT public.revenue_cycle_invoices(s.id));
  IF NOT EXISTS(SELECT 1 FROM public.finance_revenue_revisions WHERE cycle_id=cycle) THEN RETURN NULL;END IF;
 ELSE cycle:=NEW.cycle_id;END IF;
 PERFORM public.validate_revised_cycle_graph(cycle);RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS revenue_revision_source ON public.journal_entries;
CREATE TRIGGER revenue_revision_source BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_revenue_revision_sources();
DROP TRIGGER IF EXISTS revenue_revision_source ON public.customer_credit_notes;
CREATE TRIGGER revenue_revision_source BEFORE INSERT ON public.customer_credit_notes FOR EACH ROW EXECUTE FUNCTION public.guard_revenue_revision_sources();
DROP TRIGGER IF EXISTS revised_credit_graph ON public.finance_customer_credits;
CREATE CONSTRAINT TRIGGER revised_credit_graph AFTER INSERT OR UPDATE ON public.finance_customer_credits DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_revenue_revision_graph_trigger();
DO $$ DECLARE t text;f record;BEGIN
 FOREACH t IN ARRAY ARRAY['finance_revenue_revisions','finance_revenue_supplements'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);
  EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);
  EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS revenue_revision_graph ON public.%I',t);
  EXECUTE format('CREATE CONSTRAINT TRIGGER revenue_revision_graph AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_revenue_revision_graph_trigger()',t);
 END LOOP;
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('require_revisable_finance_date','pre_revision_validate','pre_revision_snapshot','pre_revision_execute','pre_revision_earned','revenue_cycle_invoices','revenue_credit_totals','revenue_cycle_balances','revenue_plan_value','revenue_change_lines','revenue_revision_preview','revenue_gross_price','revenue_allocation_basis','revenue_revision_state','validate_finance_extension','finance_source_snapshot','execute_finance_extension','contract_earned','revenue_owned_journals','validate_revenue_revision_graph','validate_revenue_supplement_graph','validate_revised_cycle_graph','guard_revenue_revision_sources','check_revenue_revision_graph_trigger') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);END LOOP;
END; $$;
COMMIT;
