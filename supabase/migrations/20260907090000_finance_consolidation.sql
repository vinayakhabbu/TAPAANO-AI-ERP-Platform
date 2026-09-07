BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.validate_intercompany_extension(uuid,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.validate_finance_extension(uuid,text,jsonb) RENAME TO validate_intercompany_extension;
  ALTER FUNCTION public.execute_finance_extension(public.finance_requests) RENAME TO execute_intercompany_extension;
  ALTER FUNCTION public.finance_source_snapshot(uuid,text,jsonb) RENAME TO intercompany_source_snapshot;
 END IF;
END; $$;

CREATE TABLE IF NOT EXISTS public.finance_groups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,reference text NOT NULL,
 name text NOT NULL,currency text NOT NULL,starts_on date NOT NULL,member_ids uuid[] NOT NULL,cta_account_id uuid NOT NULL,
 request_id uuid NOT NULL,terms jsonb NOT NULL,UNIQUE(org_id,id),UNIQUE(org_id,reference),UNIQUE(request_id),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),FOREIGN KEY(org_id,cta_account_id) REFERENCES public.accounts(org_id,id),FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id)
);
CREATE TABLE IF NOT EXISTS public.finance_group_adjustments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,group_id uuid NOT NULL,as_of date NOT NULL,
 reference text NOT NULL,lines jsonb NOT NULL,source_journals uuid[] NOT NULL,request_id uuid NOT NULL,
 reversal_date date,reversal_request uuid,
 UNIQUE(org_id,id),UNIQUE(group_id,reference),UNIQUE(request_id),
 FOREIGN KEY(org_id,group_id) REFERENCES public.finance_groups(org_id,id),FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),FOREIGN KEY(org_id,reversal_request) REFERENCES public.finance_requests(org_id,id),
 CHECK((reversal_date IS NULL AND reversal_request IS NULL) OR (reversal_request IS NOT NULL AND reversal_date IS NOT NULL AND reversal_date>=as_of))
);
CREATE TABLE IF NOT EXISTS public.finance_consolidations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,group_id uuid NOT NULL,starts_on date NOT NULL,ends_on date NOT NULL,
 rates jsonb NOT NULL,report jsonb NOT NULL,request_id uuid NOT NULL,active boolean NOT NULL DEFAULT true,reopen_request uuid,
 UNIQUE(org_id,id),UNIQUE(request_id),FOREIGN KEY(org_id,group_id) REFERENCES public.finance_groups(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),FOREIGN KEY(org_id,reopen_request) REFERENCES public.finance_requests(org_id,id)
);
CREATE INDEX IF NOT EXISTS finance_group_members ON public.finance_groups USING gin(member_ids);
CREATE INDEX IF NOT EXISTS finance_consolidation_cutoff ON public.finance_consolidations(group_id,ends_on) WHERE active;

CREATE OR REPLACE FUNCTION public.validate_finance_group(p_group uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_g public.finance_groups%ROWTYPE;
BEGIN
 SELECT * INTO v_g FROM public.finance_groups WHERE id=p_group;
 IF v_g.id IS NULL OR v_g.terms->>'ownership_basis' IS DISTINCT FROM 'WHOLLY_OWNED' OR v_g.reference IS DISTINCT FROM v_g.terms->>'reference' OR v_g.name IS DISTINCT FROM v_g.terms->>'name' OR v_g.currency IS DISTINCT FROM v_g.terms->>'currency' OR v_g.starts_on IS DISTINCT FROM (v_g.terms->>'starts_on')::date OR v_g.cta_account_id IS DISTINCT FROM (v_g.terms->>'cta_account_id')::uuid OR
  v_g.member_ids IS DISTINCT FROM ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(v_g.terms->'member_ids') ORDER BY value::uuid) THEN RAISE EXCEPTION 'reporting group definition mismatch'; END IF;
 IF cardinality(v_g.member_ids) NOT BETWEEN 2 AND 25 OR NOT (v_g.entity_id=ANY(v_g.member_ids)) OR (SELECT count(DISTINCT id) FROM public.entities WHERE id=ANY(v_g.member_ids) AND org_id=v_g.org_id)<>cardinality(v_g.member_ids) THEN RAISE EXCEPTION 'group membership lineage mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_g.request_id AND org_id=v_g.org_id AND entity_id=v_g.entity_id AND kind='GROUP_CREATE' AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by AND payload=v_g.terms) OR
    NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=v_g.cta_account_id AND org_id=v_g.org_id AND account_type='equity') THEN RAISE EXCEPTION 'group approval or translation-account lineage mismatch'; END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.require_finance_group(p_group uuid,p_from date,p_through date)
RETURNS public.finance_groups LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_g public.finance_groups%ROWTYPE;
BEGIN
 SELECT * INTO v_g FROM public.finance_groups WHERE id=p_group AND org_id=public.get_user_org_id();
 IF v_g.id IS NULL THEN RAISE EXCEPTION 'reporting group unavailable'; END IF;
 PERFORM public.validate_finance_group(v_g.id);
 IF p_from IS NULL OR p_through IS NULL OR p_from<v_g.starts_on OR p_through<p_from OR p_through>CURRENT_DATE OR p_through>=p_from+interval '10 years' THEN RAISE EXCEPTION 'group dates must follow the approved membership start and span less than ten years through today'; END IF;
 RETURN v_g;
END; $$;

CREATE OR REPLACE FUNCTION public.finance_fx_index(p_rates jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_r jsonb;v_key text;v_map jsonb:='{}';v_date date;
BEGIN
 IF jsonb_typeof(p_rates) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rates)>1500 THEN RAISE EXCEPTION 'rates must contain at most 1500 exact dated quotes'; END IF;
 FOR v_r IN SELECT value FROM jsonb_array_elements(p_rates) LOOP
  IF v_r-ARRAY['currency','kind','date','rate']<>'{}'::jsonb OR coalesce(v_r->>'currency','') !~ '^[A-Z]{3}$' OR coalesce(v_r->>'kind','') NOT IN ('CLOSING','AVERAGE','HISTORICAL') OR
   coalesce(v_r->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR jsonb_typeof(v_r->'rate') IS DISTINCT FROM 'string' OR coalesce(v_r->>'rate','') !~ '^[0-9]{1,6}(\.[0-9]{1,8})?$' THEN RAISE EXCEPTION 'invalid exact exchange-rate quote'; END IF;
  v_date:=(v_r->>'date')::date;
  IF v_date<DATE '0001-01-01' OR v_date>DATE '9999-12-31' OR (v_r->>'rate')::numeric<=0 OR (v_r->>'kind'='AVERAGE' AND extract(day FROM v_date)<>1) THEN RAISE EXCEPTION 'positive rates and valid historical, closing or monthly average dates required'; END IF;
  v_key:=(v_r->>'currency')||':'||(v_r->>'kind')||':'||(v_r->>'date');IF v_map ? v_key THEN RAISE EXCEPTION 'duplicate exchange-rate quote'; END IF;
  v_map:=jsonb_set(v_map,ARRAY[v_key],v_r->'rate');
 END LOOP;RETURN v_map;
END; $$;
CREATE OR REPLACE FUNCTION public.finance_fx_rate(p_rates jsonb,p_currency text,p_target text,p_kind text,p_date date)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_key text;v_rate numeric;
BEGIN
 IF p_currency=p_target THEN RETURN 1; END IF;
 v_key:=p_currency||':'||p_kind||':'||p_date;v_rate:=(p_rates->>v_key)::numeric;
 IF v_rate IS NULL OR v_rate<=0 THEN RAISE EXCEPTION 'missing % exchange rate for % on %',p_kind,p_currency,p_date; END IF;RETURN v_rate;
END; $$;
CREATE OR REPLACE FUNCTION public.get_consolidation_rate_requirements(p_group uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_g public.finance_groups%ROWTYPE;v_rows jsonb;v_e uuid;
BEGIN
 v_g:=public.require_finance_group(p_group,p_from,p_through);
 FOREACH v_e IN ARRAY v_g.member_ids LOOP PERFORM public.get_entity_trial_balance(v_e,p_from,p_through);END LOOP;
 WITH requirements AS (
  SELECT e.currency,'CLOSING'::text AS kind,p_through AS date FROM public.entities e WHERE e.id=ANY(v_g.member_ids) AND e.currency<>v_g.currency
  UNION SELECT e.currency,'CLOSING',p_from-1 FROM public.entities e WHERE e.id=ANY(v_g.member_ids) AND e.currency<>v_g.currency
  UNION SELECT e.currency,CASE WHEN a.account_type='equity' THEN 'HISTORICAL' ELSE 'AVERAGE' END,
   CASE WHEN a.account_type='equity' THEN j.entry_date ELSE date_trunc('month',j.entry_date)::date END
  FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id JOIN public.entities e ON e.id=j.entity_id JOIN public.accounts a ON a.id=l.account_id
  WHERE j.entity_id=ANY(v_g.member_ids) AND j.org_id=v_g.org_id AND j.status='posted' AND j.entry_date<=p_through AND e.currency<>v_g.currency AND
   (a.account_type IN ('revenue','expense','equity') OR (j.entry_date>=p_from AND EXISTS(SELECT 1 FROM public.cash_registers WHERE entity_id=j.entity_id AND account_id=l.account_id)))
   AND NOT EXISTS(SELECT 1 FROM public.finance_year_closes c WHERE j.id IN (c.journal_id,c.reversal_journal))
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('currency',currency,'kind',kind,'date',date) ORDER BY currency,kind,date),'[]') INTO v_rows FROM requirements;
 IF jsonb_array_length(v_rows)>1500 THEN RAISE EXCEPTION 'group history requires more than 1500 quotes; qualify a larger accepted translation policy before proceeding'; END IF;
 RETURN jsonb_build_object('groupId',v_g.id,'currency',v_g.currency,'from',p_from,'through',p_through,'quotes',v_rows);
END; $$;

CREATE OR REPLACE FUNCTION public.group_income_translation(p_entity uuid,p_account uuid,p_from date,p_through date,p_currency text,p_target text,p_rates jsonb)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(sum(round((l.debit-l.credit)*public.finance_fx_rate(p_rates,p_currency,p_target,'AVERAGE',date_trunc('month',j.entry_date)::date),2)),0)
 FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id JOIN public.accounts a ON a.id=l.account_id
 WHERE j.entity_id=p_entity AND j.status='posted' AND j.entry_date BETWEEN p_from AND p_through AND a.account_type IN ('revenue','expense') AND (p_account IS NULL OR l.account_id=p_account)
 AND NOT EXISTS(SELECT 1 FROM public.finance_year_closes c WHERE j.id IN (c.journal_id,c.reversal_journal))
$$;
CREATE OR REPLACE FUNCTION public.group_account_translation(p_entity uuid,p_account uuid,p_type text,p_from date,p_through date,p_currency text,p_target text,p_rates jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_closing numeric:=0;v_income numeric:=0;v_c public.finance_year_closes%ROWTYPE;
BEGIN
 IF p_type IN ('asset','liability') THEN
  SELECT round(coalesce(sum(l.debit-l.credit),0)*public.finance_fx_rate(p_rates,p_currency,p_target,'CLOSING',p_through),2) INTO v_closing FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.entity_id=p_entity AND j.status='posted' AND j.entry_date<=p_through AND l.account_id=p_account;
 ELSIF p_type IN ('revenue','expense') THEN
  v_income:=public.group_income_translation(p_entity,p_account,p_from,p_through,p_currency,p_target,p_rates);
  v_closing:=public.group_income_translation(p_entity,p_account,DATE '0001-01-01',p_through,p_currency,p_target,p_rates);
  FOR v_c IN SELECT * FROM public.finance_year_closes WHERE entity_id=p_entity AND active AND ends_on<=p_through LOOP
   v_closing:=v_closing-public.group_income_translation(p_entity,p_account,v_c.starts_on,v_c.ends_on,p_currency,p_target,p_rates);
  END LOOP;
 ELSE
  SELECT coalesce(sum(round((l.debit-l.credit)*public.finance_fx_rate(p_rates,p_currency,p_target,'HISTORICAL',j.entry_date),2)),0) INTO v_closing FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id
   WHERE j.entity_id=p_entity AND j.status='posted' AND j.entry_date<=p_through AND l.account_id=p_account AND NOT EXISTS(SELECT 1 FROM public.finance_year_closes c WHERE j.id IN (c.journal_id,c.reversal_journal));
  -- Roll translated earnings forward, including a zero local-currency profit or
  -- closing journal with no retained-earnings line. A closing spot rate is not used.
  FOR v_c IN SELECT * FROM public.finance_year_closes WHERE entity_id=p_entity AND retained_account_id=p_account AND active AND ends_on<=p_through LOOP
   v_closing:=v_closing+public.group_income_translation(p_entity,NULL,v_c.starts_on,v_c.ends_on,p_currency,p_target,p_rates);
  END LOOP;
 END IF;
 RETURN jsonb_build_object('closing',round(v_closing,2)::text,'income',round(v_income,2)::text);
END; $$;
CREATE OR REPLACE FUNCTION public.finance_add_bucket(p_map jsonb,p_key text,p_closing numeric,p_income numeric)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_set(p_map,ARRAY[p_key],jsonb_build_object('closing',coalesce((p_map->p_key->>'closing')::numeric,0)+p_closing,'income',coalesce((p_map->p_key->>'income')::numeric,0)+p_income))
$$;
CREATE OR REPLACE FUNCTION public.group_carrying_account(p_entity uuid,p_account uuid,p_type text,p_date date,p_through date)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;
BEGIN
 IF p_type IN ('revenue','expense') THEN SELECT retained_account_id INTO v_id FROM public.finance_year_closes WHERE entity_id=p_entity AND active AND ends_on<=p_through AND p_date BETWEEN starts_on AND ends_on;END IF;
 RETURN coalesce(v_id,p_account);
END; $$;

CREATE OR REPLACE FUNCTION public.validate_group_adjustment(p_adjustment uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_a public.finance_group_adjustments%ROWTYPE;v_g public.finance_groups%ROWTYPE;v_r public.finance_requests%ROWTYPE;v_d numeric;v_c numeric;
BEGIN
 SELECT * INTO v_a FROM public.finance_group_adjustments WHERE id=p_adjustment;SELECT * INTO v_g FROM public.finance_groups WHERE id=v_a.group_id;
 SELECT * INTO v_r FROM public.finance_requests WHERE id=v_a.request_id AND org_id=v_a.org_id AND entity_id=v_g.entity_id AND kind='GROUP_ADJUSTMENT' AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by;
 IF v_a.id IS NULL OR v_r.id IS NULL OR v_a.group_id IS DISTINCT FROM (v_r.payload->>'group_id')::uuid OR v_a.as_of IS DISTINCT FROM (v_r.payload->>'date')::date OR v_a.reference IS DISTINCT FROM v_r.payload->>'reference' OR v_a.lines IS DISTINCT FROM v_r.payload->'lines' OR
  v_a.source_journals IS DISTINCT FROM ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(v_r.payload->'source_journals') ORDER BY value::uuid) THEN RAISE EXCEPTION 'group adjustment approval or source mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_a.lines) l WHERE NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(l->>'account_id')::uuid AND org_id=v_a.org_id) OR NOT (((l->>'debit')::numeric>0 AND (l->>'credit')::numeric=0) OR ((l->>'credit')::numeric>0 AND (l->>'debit')::numeric=0))) THEN RAISE EXCEPTION 'group adjustment account or line mismatch'; END IF;
 SELECT sum((value->>'debit')::numeric),sum((value->>'credit')::numeric) INTO v_d,v_c FROM jsonb_array_elements(v_a.lines);
 IF v_d IS NULL OR v_d<>v_c OR v_d<=0 OR (SELECT count(*) FROM public.journal_entries WHERE id=ANY(v_a.source_journals) AND org_id=v_a.org_id AND entity_id=ANY(v_g.member_ids) AND status='posted' AND entry_date<=v_a.as_of)<>cardinality(v_a.source_journals) THEN RAISE EXCEPTION 'group adjustment evidence or balance is invalid'; END IF;
 IF v_a.reversal_request IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_a.reversal_request AND org_id=v_a.org_id AND entity_id=v_g.entity_id AND kind='GROUP_ADJUSTMENT_REVERSE' AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by AND payload=jsonb_build_object('adjustment_id',v_a.id,'date',v_a.reversal_date)) THEN RAISE EXCEPTION 'group adjustment reversal lineage mismatch'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_consolidation_report(p_group uuid,p_from date,p_through date,p_rates jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_g public.finance_groups%ROWTYPE;v_fx jsonb;v_required jsonb;v_q jsonb;v_e public.entities%ROWTYPE;v_t public.finance_intercompany%ROWTYPE;v_adj public.finance_group_adjustments%ROWTYPE;v_c public.finance_year_closes%ROWTYPE;
 v_trial jsonb;v_check jsonb;v_row jsonb;v_translated jsonb;v_member_rows jsonb;v_members jsonb:='[]';v_sources jsonb:='{}';v_automatic jsonb:='{}';v_adjustments jsonb:='{}';v_cta jsonb:='{}';v_due jsonb:='{}';v_result jsonb;v_rows jsonb;v_external jsonb;
 v_key text;v_bucket jsonb;v_account uuid;v_carry uuid;v_entity uuid;v_type text;v_date date;v_sign integer;v_side integer;v_amount numeric;v_outstanding numeric;v_net numeric;v_closed boolean;v_ready boolean:=true;v_pending integer;v_adjustment_issues integer:=0;v_journal_count bigint:=0;
BEGIN
 v_g:=public.require_finance_group(p_group,p_from,p_through);v_fx:=public.finance_fx_index(p_rates);v_required:=public.get_consolidation_rate_requirements(p_group,p_from,p_through)->'quotes';
 IF jsonb_array_length(p_rates)<>jsonb_array_length(v_required) THEN RAISE EXCEPTION 'provide exactly the required exchange-rate quotes'; END IF;
 FOR v_q IN SELECT value FROM jsonb_array_elements(v_required) LOOP PERFORM public.finance_fx_rate(v_fx,v_q->>'currency',v_g.currency,v_q->>'kind',(v_q->>'date')::date);END LOOP;
 IF EXISTS(SELECT 1 FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.entity_id=ANY(v_g.member_ids) AND l.account_id=v_g.cta_account_id) THEN RAISE EXCEPTION 'the group translation account must be reserved for consolidation'; END IF;
 FOR v_e IN SELECT * FROM public.entities WHERE id=ANY(v_g.member_ids) ORDER BY id LOOP
  v_trial:=public.get_entity_trial_balance(v_e.id,p_from,p_through);v_check:=public.get_finance_close_check(v_e.id,p_from,p_through)-'generatedAt'-'revision';
  FOR v_c IN SELECT * FROM public.finance_year_closes WHERE entity_id=v_e.id LOOP PERFORM public.validate_fiscal_close_graph(v_c.id);END LOOP;
  SELECT coalesce(sum(least(period_end,p_through)-greatest(period_start,p_from)+1),0)=p_through-p_from+1 AND coalesce(bool_and(status<>'OPEN'),false) INTO v_closed FROM public.accounting_periods WHERE entity_id=v_e.id AND period_start<=p_through AND period_end>=p_from;
  v_ready:=v_ready AND v_closed AND (v_check->>'canClose')::boolean;v_member_rows:='[]';v_net:=0;v_journal_count:=v_journal_count+(v_trial->>'journalCount')::bigint;
  FOR v_row IN SELECT value FROM jsonb_array_elements(v_trial->'rows') LOOP
   v_account:=(v_row->>'accountId')::uuid;v_translated:=public.group_account_translation(v_e.id,v_account,v_row->>'accountType',p_from,p_through,v_e.currency,v_g.currency,v_fx);
   v_member_rows:=v_member_rows||jsonb_build_array(jsonb_build_object('accountId',v_account,'closing',v_translated->>'closing','income',v_translated->>'income'));
   v_sources:=public.finance_add_bucket(v_sources,v_account::text,(v_translated->>'closing')::numeric,(v_translated->>'income')::numeric);v_net:=v_net+(v_translated->>'closing')::numeric;
  END LOOP;
  -- A zero local retained-earnings balance can still carry translated earnings.
  FOR v_account IN SELECT DISTINCT retained_account_id FROM public.finance_year_closes WHERE entity_id=v_e.id AND active AND ends_on<=p_through AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_trial->'rows') r WHERE r->>'accountId'=retained_account_id::text) LOOP
   v_translated:=public.group_account_translation(v_e.id,v_account,'equity',p_from,p_through,v_e.currency,v_g.currency,v_fx);v_sources:=public.finance_add_bucket(v_sources,v_account::text,(v_translated->>'closing')::numeric,0);v_net:=v_net+(v_translated->>'closing')::numeric;v_member_rows:=v_member_rows||jsonb_build_array(jsonb_build_object('accountId',v_account,'closing',v_translated->>'closing','income','0.00'));
  END LOOP;
  v_cta:=public.finance_add_bucket(v_cta,v_g.cta_account_id::text,-v_net,0);
  v_members:=v_members||jsonb_build_array(jsonb_build_object('entityId',v_e.id,'name',v_e.name,'currency',v_e.currency,'ledgerRevision',v_trial->>'revision','journalCount',v_trial->'journalCount','periodsClosed',v_closed,'closeChecks',v_check,'rows',v_member_rows,'translationAdjustment',round(-v_net,2)::text));
 END LOOP;
 FOR v_t IN SELECT * FROM public.finance_intercompany WHERE org_id=v_g.org_id AND entity_id=ANY(v_g.member_ids) AND counterparty_id=ANY(v_g.member_ids) AND as_of<=p_through ORDER BY id LOOP
  PERFORM public.validate_intercompany_graph(v_t.id);v_outstanding:=CASE WHEN v_t.reversal_date<=p_through THEN 0 ELSE v_t.amount-public.intercompany_settled(v_t.id,p_through) END;
  v_amount:=v_outstanding*public.finance_fx_rate(v_fx,v_t.currency,v_g.currency,'CLOSING',p_through);
  v_due:=public.finance_add_bucket(v_due,(v_t.terms->>'due_from_account_id')||':'||v_t.currency,-v_amount,0);v_due:=public.finance_add_bucket(v_due,(v_t.terms->>'due_to_account_id')||':'||v_t.currency,v_amount,0);
  IF v_t.kind='SERVICE' THEN
   FOR v_date,v_sign IN SELECT v_t.as_of,1 UNION ALL SELECT v_t.reversal_date,-1 WHERE v_t.reversal_date<=p_through LOOP
    v_amount:=round(v_t.amount*public.finance_fx_rate(v_fx,v_t.currency,v_g.currency,'AVERAGE',date_trunc('month',v_date)::date),2)*v_sign;
    FOR v_side IN 1..2 LOOP
     v_entity:=CASE WHEN v_side=1 THEN v_t.entity_id ELSE v_t.counterparty_id END;v_account:=(v_t.terms->>CASE WHEN v_side=1 THEN 'seller_offset_account_id' ELSE 'buyer_offset_account_id' END)::uuid;v_type:=CASE WHEN v_side=1 THEN 'revenue' ELSE 'expense' END;
     v_carry:=public.group_carrying_account(v_entity,v_account,v_type,v_date,p_through);
     v_automatic:=public.finance_add_bucket(v_automatic,v_carry::text,CASE WHEN v_side=1 THEN v_amount ELSE -v_amount END,0);
     IF v_date>=p_from THEN v_automatic:=public.finance_add_bucket(v_automatic,v_account::text,0,CASE WHEN v_side=1 THEN v_amount ELSE -v_amount END);END IF;
    END LOOP;
   END LOOP;
  END IF;
 END LOOP;
 FOR v_key,v_bucket IN SELECT * FROM jsonb_each(v_due) LOOP v_automatic:=public.finance_add_bucket(v_automatic,split_part(v_key,':',1),round((v_bucket->>'closing')::numeric,2),0);END LOOP;
 FOR v_adj IN SELECT * FROM public.finance_group_adjustments WHERE group_id=v_g.id AND as_of<=p_through ORDER BY as_of,id LOOP
  PERFORM public.validate_group_adjustment(v_adj.id);
  IF (v_adj.reversal_date IS NULL OR v_adj.reversal_date>p_through) AND EXISTS(SELECT 1 FROM public.journal_entries j JOIN public.journal_entries offset_j ON offset_j.id=j.reversed_by_id WHERE j.id=ANY(v_adj.source_journals) AND offset_j.entry_date<=p_through) THEN v_adjustment_issues:=v_adjustment_issues+1;END IF;
  FOR v_date,v_sign IN SELECT v_adj.as_of,1 UNION ALL SELECT v_adj.reversal_date,-1 WHERE v_adj.reversal_date<=p_through LOOP
   FOR v_row IN SELECT value FROM jsonb_array_elements(v_adj.lines) LOOP
    v_account:=(v_row->>'account_id')::uuid;SELECT account_type::text INTO v_type FROM public.accounts WHERE id=v_account;v_carry:=public.group_carrying_account(v_g.entity_id,v_account,v_type,v_date,p_through);
    v_amount:=((v_row->>'debit')::numeric-(v_row->>'credit')::numeric)*v_sign;
    v_adjustments:=public.finance_add_bucket(v_adjustments,v_carry::text,v_amount,0);IF v_date>=p_from AND v_type IN ('revenue','expense') THEN v_adjustments:=public.finance_add_bucket(v_adjustments,v_account::text,0,v_amount);END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 WITH keys AS (SELECT jsonb_object_keys(v_sources||v_automatic||v_adjustments||v_cta) AS key), amounts AS (
  SELECT k.key,a.code,a.name,a.account_type,
   coalesce((v_sources->k.key->>'closing')::numeric,0) AS source,coalesce((v_automatic->k.key->>'closing')::numeric,0) AS automatic,coalesce((v_adjustments->k.key->>'closing')::numeric,0) AS adjustment,coalesce((v_cta->k.key->>'closing')::numeric,0) AS translation,
   coalesce((v_sources->k.key->>'income')::numeric,0) AS source_income,coalesce((v_automatic->k.key->>'income')::numeric,0) AS automatic_income,coalesce((v_adjustments->k.key->>'income')::numeric,0) AS adjustment_income
  FROM keys k JOIN public.accounts a ON a.id=k.key::uuid AND a.org_id=v_g.org_id
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('accountId',key,'code',code,'name',name,'accountType',account_type,'sourceClosing',round(source,2)::text,'automaticClosing',round(automatic,2)::text,'adjustmentClosing',round(adjustment,2)::text,'translationClosing',round(translation,2)::text,
  'closing',round(source+automatic+adjustment+translation,2)::text,'sourceIncome',round(source_income,2)::text,'automaticIncome',round(automatic_income,2)::text,'adjustmentIncome',round(adjustment_income,2)::text,'income',round(source_income+automatic_income+adjustment_income,2)::text) ORDER BY code,key),'[]') INTO v_rows FROM amounts;
 SELECT coalesce(sum((value->>'closing')::numeric),0) INTO v_net FROM jsonb_array_elements(v_rows);IF v_net<>0 THEN RAISE EXCEPTION 'consolidated accounts do not balance after translation and elimination'; END IF;
 SELECT count(*) INTO v_pending FROM public.finance_requests WHERE org_id=v_g.org_id AND state='PENDING' AND kind IN ('GROUP_ADJUSTMENT','GROUP_ADJUSTMENT_REVERSE') AND (payload->>'group_id'=v_g.id::text OR payload->>'adjustment_id' IN (SELECT id::text FROM public.finance_group_adjustments WHERE group_id=v_g.id));
 SELECT coalesce(jsonb_agg(jsonb_build_object('transferId',id,'reference',reference,'sellerId',entity_id,'buyerId',counterparty_id,'currency',currency,'outstanding',round(CASE WHEN reversal_date<=p_through THEN 0 ELSE amount-public.intercompany_settled(id,p_through) END,2)::text) ORDER BY id),'[]') INTO v_external FROM public.finance_intercompany WHERE org_id=v_g.org_id AND as_of<=p_through AND ((entity_id=ANY(v_g.member_ids))<>(counterparty_id=ANY(v_g.member_ids)));
 v_result:=jsonb_build_object('groupId',v_g.id,'groupName',v_g.name,'currency',v_g.currency,'from',p_from,'through',p_through,'members',v_members,'rates',p_rates,'rows',v_rows,'canFinalize',v_ready AND v_pending=0 AND v_adjustment_issues=0,'unresolvedAdjustmentSources',v_adjustment_issues,'pendingGroupAdjustments',v_pending,'externalIntercompany',v_external,'journalCount',v_journal_count,
  'netIncome',round(-coalesce((SELECT sum((value->>'income')::numeric) FROM jsonb_array_elements(v_rows)),0),2)::text,'translationAdjustment',round(coalesce((v_cta->v_g.cta_account_id::text->>'closing')::numeric,0),2)::text);
 RETURN v_result||jsonb_build_object('revision',md5(v_result::text),'generatedAt',statement_timestamp());
END; $$;

CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_g public.finance_groups%ROWTYPE;v_a public.finance_group_adjustments%ROWTYPE;v_c public.finance_consolidations%ROWTYPE;v_members uuid[];v_sources uuid[];v_date date;v_from date;v_report jsonb;v_row jsonb;
BEGIN
 IF p_kind NOT IN ('GROUP_CREATE','GROUP_ADJUSTMENT','GROUP_ADJUSTMENT_REVERSE','GROUP_CONSOLIDATE','GROUP_REOPEN') THEN RETURN public.validate_intercompany_extension(p_entity,p_kind,p_payload); END IF;
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'group definitions, adjustments and final reports require administrator review'; END IF;
 IF p_kind='GROUP_CREATE' THEN
  IF p_payload-ARRAY['reference','name','currency','starts_on','member_ids','cta_account_id','ownership_basis']<>'{}'::jsonb OR length(coalesce(p_payload->>'reference','')) NOT BETWEEN 1 AND 80 OR length(coalesce(p_payload->>'name','')) NOT BETWEEN 1 AND 100 OR
   p_payload->>'ownership_basis' IS DISTINCT FROM 'WHOLLY_OWNED' OR jsonb_typeof(p_payload->'member_ids') IS DISTINCT FROM 'array' OR coalesce(p_payload->>'starts_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'invalid wholly owned group definition'; END IF;
  v_members:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'member_ids') ORDER BY value::uuid);v_date:=(p_payload->>'starts_on')::date;
  IF cardinality(v_members) NOT BETWEEN 2 AND 25 OR NOT (p_entity=ANY(v_members)) OR v_date<=DATE '0001-01-01' OR v_date>CURRENT_DATE OR (SELECT count(DISTINCT id) FROM public.entities WHERE id=ANY(v_members) AND org_id=v_org)<>cardinality(v_members) OR
    NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity AND org_id=v_org AND currency=p_payload->>'currency') THEN RAISE EXCEPTION 'group requires unique tenant members, its reporting parent and the parent functional currency'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(p_payload->>'cta_account_id')::uuid AND org_id=v_org AND account_type='equity' AND is_active) OR EXISTS(SELECT 1 FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.entity_id=ANY(v_members) AND l.account_id=(p_payload->>'cta_account_id')::uuid) THEN RAISE EXCEPTION 'unused active equity account required for group translation'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_groups WHERE org_id=v_org AND reference=p_payload->>'reference') THEN RAISE EXCEPTION 'group reference already exists; create a new approved definition for membership changes'; END IF;
  RETURN p_payload;
 ELSIF p_kind='GROUP_REOPEN' THEN
  IF p_payload-ARRAY['consolidation_id']<>'{}'::jsonb THEN RAISE EXCEPTION 'unknown group reopening fields'; END IF;
  SELECT * INTO v_c FROM public.finance_consolidations WHERE id=(p_payload->>'consolidation_id')::uuid AND org_id=v_org AND active;
  SELECT * INTO v_g FROM public.finance_groups WHERE id=v_c.group_id AND org_id=v_org AND entity_id=p_entity;
  IF v_g.id IS NULL OR EXISTS(SELECT 1 FROM public.finance_consolidations WHERE group_id=v_g.id AND active AND ends_on>v_c.ends_on) THEN RAISE EXCEPTION 'reopen the latest active group report first'; END IF;
  RETURN p_payload;
 ELSIF p_kind='GROUP_ADJUSTMENT_REVERSE' THEN
  IF p_payload-ARRAY['adjustment_id','date']<>'{}'::jsonb THEN RAISE EXCEPTION 'unknown group adjustment correction fields'; END IF;
  SELECT * INTO v_a FROM public.finance_group_adjustments WHERE id=(p_payload->>'adjustment_id')::uuid AND org_id=v_org;
  SELECT * INTO v_g FROM public.finance_groups WHERE id=v_a.group_id AND org_id=v_org AND entity_id=p_entity;
  IF v_a.id IS NULL OR v_a.reversal_request IS NOT NULL THEN RAISE EXCEPTION 'unreversed group adjustment required'; END IF;
 ELSE SELECT * INTO v_g FROM public.finance_groups WHERE id=(p_payload->>'group_id')::uuid AND org_id=v_org AND entity_id=p_entity; END IF;
 IF v_g.id IS NULL THEN RAISE EXCEPTION 'group unavailable to the reporting parent'; END IF;
 IF p_kind='GROUP_CONSOLIDATE' THEN
  IF p_payload-ARRAY['group_id','starts_on','ends_on','rates','attestations']<>'{}'::jsonb OR coalesce(p_payload->>'starts_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_payload->>'ends_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR
   p_payload->'attestations' IS DISTINCT FROM jsonb_build_object('ownership_and_periods_reviewed',true,'fx_policy_reviewed',true,'eliminations_reviewed',true) THEN RAISE EXCEPTION 'group dates, rates and explicit accounting attestations required'; END IF;
  v_from:=(p_payload->>'starts_on')::date;v_date:=(p_payload->>'ends_on')::date;
  IF EXISTS(SELECT 1 FROM public.finance_consolidations WHERE group_id=v_g.id AND active AND ends_on>=v_date) THEN RAISE EXCEPTION 'reopen a later or same-date final report before replacing it'; END IF;
  v_report:=public.get_consolidation_report(v_g.id,v_from,v_date,p_payload->'rates');
  IF NOT (v_report->>'canFinalize')::boolean THEN RAISE EXCEPTION 'all member periods, source controls and group adjustments must be resolved before final consolidation'; END IF;
  RETURN p_payload;
 END IF;
 IF coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'group adjustment date required'; END IF;
 v_date:=(p_payload->>'date')::date;
 IF v_date<v_g.starts_on OR v_date>CURRENT_DATE OR (v_a.id IS NOT NULL AND v_date<v_a.as_of) OR EXISTS(SELECT 1 FROM public.finance_consolidations WHERE group_id=v_g.id AND active AND ends_on>=v_date) THEN RAISE EXCEPTION 'group adjustment date must follow the approved group cutoff; reopen the group first'; END IF;
 IF p_kind='GROUP_ADJUSTMENT' THEN
  IF p_payload-ARRAY['group_id','date','reference','lines','source_journals']<>'{}'::jsonb OR jsonb_typeof(p_payload->'source_journals') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'unknown group adjustment fields or missing source journals'; END IF;
  PERFORM public.validate_finance_request(p_entity,'MANUAL_JOURNAL',jsonb_build_object('number',p_payload->>'reference','date',v_date,'memo','Consolidation adjustment','lines',p_payload->'lines'));
  v_sources:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'source_journals') ORDER BY value::uuid);
  IF cardinality(v_sources) NOT BETWEEN 1 AND 100 OR (SELECT count(DISTINCT id) FROM public.journal_entries WHERE id=ANY(v_sources) AND org_id=v_org AND entity_id=ANY(v_g.member_ids) AND status='posted' AND reversed_by_id IS NULL AND entry_date<=v_date)<>cardinality(v_sources) THEN RAISE EXCEPTION 'one to 100 unique posted member journals must support the adjustment'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_group_adjustments WHERE group_id=v_g.id AND reference=p_payload->>'reference') THEN RAISE EXCEPTION 'group adjustment reference already exists'; END IF;
  FOR v_row IN SELECT value FROM jsonb_array_elements(p_payload->'lines') LOOP
   IF (v_row->>'account_id')::uuid=v_g.cta_account_id OR EXISTS(SELECT 1 FROM public.cash_registers WHERE entity_id=ANY(v_g.member_ids) AND account_id=(v_row->>'account_id')::uuid) THEN RAISE EXCEPTION 'group adjustments cannot replace computed translation or registered bank balances'; END IF;
  END LOOP;
  PERFORM public.get_consolidation_rate_requirements(v_g.id,v_date,v_date);
 END IF;
 RETURN p_payload;
END; $$;

CREATE OR REPLACE FUNCTION public.finance_source_snapshot(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_g public.finance_groups%ROWTYPE;v_a public.finance_group_adjustments%ROWTYPE;v_c public.finance_consolidations%ROWTYPE;v_rows jsonb;
BEGIN
 IF p_kind='GROUP_CREATE' THEN
  SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'currency',currency) ORDER BY id) INTO v_rows FROM public.entities WHERE org_id=public.get_user_org_id() AND id IN (SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'member_ids'));
  RETURN jsonb_build_object('members',v_rows,'ownership_basis','Wholly owned for the entire accepted reporting interval');
 ELSIF p_kind='GROUP_CONSOLIDATE' THEN RETURN public.get_consolidation_report((p_payload->>'group_id')::uuid,(p_payload->>'starts_on')::date,(p_payload->>'ends_on')::date,p_payload->'rates')-'generatedAt';
 ELSIF p_kind='GROUP_REOPEN' THEN
  SELECT * INTO v_c FROM public.finance_consolidations WHERE id=(p_payload->>'consolidation_id')::uuid AND org_id=public.get_user_org_id();
  RETURN jsonb_build_object('id',v_c.id,'group',v_c.group_id,'starts_on',v_c.starts_on,'ends_on',v_c.ends_on,'active',v_c.active,'revision',v_c.report->>'revision');
 ELSIF p_kind='GROUP_ADJUSTMENT_REVERSE' THEN
  SELECT * INTO v_a FROM public.finance_group_adjustments WHERE id=(p_payload->>'adjustment_id')::uuid AND org_id=public.get_user_org_id();
  RETURN jsonb_build_object('id',v_a.id,'date',v_a.as_of,'reference',v_a.reference,'lines',v_a.lines,'reversed_on',v_a.reversal_date,'source_journals',v_a.source_journals);
 ELSIF p_kind='GROUP_ADJUSTMENT' THEN
  SELECT jsonb_agg(jsonb_build_object('id',j.id,'entity',j.entity_id,'number',j.entry_number,'date',j.entry_date,'reversed_by',j.reversed_by_id,'lines',
    (SELECT jsonb_agg(jsonb_build_object('account_id',account_id,'debit',debit::text,'credit',credit::text) ORDER BY id) FROM public.journal_lines WHERE journal_entry_id=j.id)) ORDER BY j.id) INTO v_rows
   FROM public.journal_entries j WHERE j.org_id=public.get_user_org_id() AND j.id IN (SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'source_journals'));
  RETURN jsonb_build_object('source_journals',v_rows);
 END IF;
 RETURN public.intercompany_source_snapshot(p_entity,p_kind,p_payload);
END; $$;

CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p jsonb:=p_request.payload;v_id uuid;
BEGIN
 IF p_request.kind='GROUP_CREATE' THEN
  INSERT INTO public.finance_groups(org_id,entity_id,reference,name,currency,starts_on,member_ids,cta_account_id,request_id,terms)
   VALUES(p_request.org_id,p_request.entity_id,v_p->>'reference',v_p->>'name',v_p->>'currency',(v_p->>'starts_on')::date,ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(v_p->'member_ids') ORDER BY value::uuid),(v_p->>'cta_account_id')::uuid,p_request.id,v_p) RETURNING id INTO v_id;
  RETURN jsonb_build_object('groupId',v_id);
 ELSIF p_request.kind='GROUP_ADJUSTMENT' THEN
  INSERT INTO public.finance_group_adjustments(org_id,group_id,as_of,reference,lines,source_journals,request_id)
   VALUES(p_request.org_id,(v_p->>'group_id')::uuid,(v_p->>'date')::date,v_p->>'reference',v_p->'lines',ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(v_p->'source_journals') ORDER BY value::uuid),p_request.id) RETURNING id INTO v_id;
  RETURN jsonb_build_object('adjustmentId',v_id);
 ELSIF p_request.kind='GROUP_ADJUSTMENT_REVERSE' THEN
  UPDATE public.finance_group_adjustments SET reversal_date=(v_p->>'date')::date,reversal_request=p_request.id WHERE id=(v_p->>'adjustment_id')::uuid RETURNING id INTO v_id;
  RETURN jsonb_build_object('adjustmentId',v_id);
 ELSIF p_request.kind='GROUP_CONSOLIDATE' THEN
  INSERT INTO public.finance_consolidations(org_id,group_id,starts_on,ends_on,rates,report,request_id)
   VALUES(p_request.org_id,(v_p->>'group_id')::uuid,(v_p->>'starts_on')::date,(v_p->>'ends_on')::date,v_p->'rates',p_request.source_snapshot,p_request.id) RETURNING id INTO v_id;
  RETURN jsonb_build_object('consolidationId',v_id,'revision',p_request.source_snapshot->>'revision');
 ELSIF p_request.kind='GROUP_REOPEN' THEN
  UPDATE public.finance_consolidations SET active=false,reopen_request=p_request.id WHERE id=(v_p->>'consolidation_id')::uuid RETURNING id INTO v_id;
  RETURN jsonb_build_object('consolidationId',v_id);
 END IF;
 RETURN public.execute_intercompany_extension(p_request);
END; $$;

CREATE OR REPLACE FUNCTION public.validate_consolidation_graph(p_consolidation uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_c public.finance_consolidations%ROWTYPE;v_g public.finance_groups%ROWTYPE;v_r public.finance_requests%ROWTYPE;v_row jsonb;v_sum numeric:=0;v_income numeric:=0;
BEGIN
 SELECT * INTO v_c FROM public.finance_consolidations WHERE id=p_consolidation;SELECT * INTO v_g FROM public.finance_groups WHERE id=v_c.group_id;
 SELECT * INTO v_r FROM public.finance_requests WHERE id=v_c.request_id AND org_id=v_c.org_id AND entity_id=v_g.entity_id AND kind='GROUP_CONSOLIDATE' AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by;
 IF v_c.id IS NULL OR v_r.id IS NULL OR v_c.report IS DISTINCT FROM v_r.source_snapshot OR v_c.group_id IS DISTINCT FROM (v_r.payload->>'group_id')::uuid OR v_c.starts_on IS DISTINCT FROM (v_r.payload->>'starts_on')::date OR v_c.ends_on IS DISTINCT FROM (v_r.payload->>'ends_on')::date OR v_c.rates IS DISTINCT FROM v_r.payload->'rates' OR
   v_c.report->>'revision' IS DISTINCT FROM md5((v_c.report-'revision')::text) OR NOT (v_c.report->>'canFinalize')::boolean THEN RAISE EXCEPTION 'consolidation approval or immutable report mismatch'; END IF;
 PERFORM public.validate_finance_group(v_g.id);
 IF jsonb_array_length(v_c.report->'members')<>cardinality(v_g.member_ids) OR (SELECT count(DISTINCT value->>'entityId') FROM jsonb_array_elements(v_c.report->'members'))<>cardinality(v_g.member_ids) OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_c.report->'members') m WHERE NOT ((m->>'entityId')::uuid=ANY(v_g.member_ids)) OR NOT (m->>'periodsClosed')::boolean OR NOT (m->'closeChecks'->>'canClose')::boolean) THEN RAISE EXCEPTION 'consolidation membership or close evidence mismatch'; END IF;
 FOR v_row IN SELECT value FROM jsonb_array_elements(v_c.report->'rows') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(v_row->>'accountId')::uuid AND org_id=v_c.org_id AND account_type::text=v_row->>'accountType') OR
    (v_row->>'closing')::numeric IS DISTINCT FROM (v_row->>'sourceClosing')::numeric+(v_row->>'automaticClosing')::numeric+(v_row->>'adjustmentClosing')::numeric+(v_row->>'translationClosing')::numeric OR
    (v_row->>'income')::numeric IS DISTINCT FROM (v_row->>'sourceIncome')::numeric+(v_row->>'automaticIncome')::numeric+(v_row->>'adjustmentIncome')::numeric THEN RAISE EXCEPTION 'consolidation account reconciliation mismatch'; END IF;
  v_sum:=v_sum+(v_row->>'closing')::numeric;v_income:=v_income-(v_row->>'income')::numeric;
 END LOOP;
 IF v_sum<>0 OR v_income IS DISTINCT FROM (v_c.report->>'netIncome')::numeric THEN RAISE EXCEPTION 'consolidated balances or earnings mismatch'; END IF;
 IF v_c.active<>(v_c.reopen_request IS NULL) OR (v_c.reopen_request IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_c.reopen_request AND org_id=v_c.org_id AND entity_id=v_g.entity_id AND kind='GROUP_REOPEN' AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by AND payload=jsonb_build_object('consolidation_id',v_c.id))) THEN RAISE EXCEPTION 'consolidation reopening lineage mismatch'; END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.check_group_graph_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='finance_groups' THEN PERFORM public.validate_finance_group(NEW.id);ELSIF TG_TABLE_NAME='finance_group_adjustments' THEN PERFORM public.validate_group_adjustment(NEW.id);ELSE PERFORM public.validate_consolidation_graph(NEW.id);END IF;RETURN NULL;
END; $$;
CREATE OR REPLACE FUNCTION public.guard_consolidated_cutoff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.finance_consolidations c JOIN public.finance_groups g ON g.id=c.group_id WHERE c.org_id=NEW.org_id AND c.active AND NEW.entity_id=ANY(g.member_ids) AND NEW.entry_date<=c.ends_on) THEN RAISE EXCEPTION 'reopen the approved consolidated report before backdating a member journal'; END IF;RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS consolidated_cutoff ON public.journal_entries;
CREATE TRIGGER consolidated_cutoff BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_consolidated_cutoff();

CREATE OR REPLACE FUNCTION public.get_approved_consolidation(p_consolidation uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_c public.finance_consolidations%ROWTYPE;v_r public.finance_requests%ROWTYPE;v_current jsonb;v_available boolean:=true;
BEGIN
 SELECT * INTO v_c FROM public.finance_consolidations WHERE id=p_consolidation AND org_id=public.get_user_org_id();IF v_c.id IS NULL THEN RAISE EXCEPTION 'approved consolidation unavailable'; END IF;
 PERFORM public.validate_consolidation_graph(v_c.id);SELECT * INTO v_r FROM public.finance_requests WHERE id=v_c.request_id;
 BEGIN v_current:=public.get_consolidation_report(v_c.group_id,v_c.starts_on,v_c.ends_on,v_c.rates);EXCEPTION WHEN others THEN v_available:=false;END;
 RETURN jsonb_build_object('id',v_c.id,'active',v_c.active,'approvedAt',v_r.decided_at,'report',v_c.report,'comparisonAvailable',v_available,'sourceChanged',CASE WHEN v_available THEN v_current->>'revision' IS DISTINCT FROM v_c.report->>'revision' ELSE NULL END);
END; $$;

CREATE OR REPLACE FUNCTION public.get_group_adjustment_sources(p_group uuid,p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_g public.finance_groups%ROWTYPE;v_rows jsonb;v_count integer;
BEGIN
 SELECT * INTO v_g FROM public.finance_groups WHERE id=p_group AND org_id=public.get_user_org_id();IF v_g.id IS NULL THEN RAISE EXCEPTION 'reporting group unavailable'; END IF;
 IF p_search IS NULL OR length(p_search)>100 THEN RAISE EXCEPTION 'source search must contain at most 100 characters'; END IF;
 WITH matches AS (SELECT id,entity_id,entry_number,entry_date FROM public.journal_entries WHERE org_id=v_g.org_id AND entity_id=ANY(v_g.member_ids) AND status='posted' AND reversed_by_id IS NULL AND strpos(lower(entry_number),lower(p_search))>0 ORDER BY entry_date DESC,id LIMIT 201), selected AS (SELECT * FROM matches ORDER BY entry_date DESC,id LIMIT 200)
 SELECT (SELECT count(*) FROM matches),coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'entityId',entity_id,'number',entry_number,'date',entry_date) ORDER BY entry_date DESC,id) FROM selected),'[]') INTO v_count,v_rows;
 RETURN jsonb_build_object('groupId',v_g.id,'hasMore',v_count>200,'rows',v_rows);
END; $$;

CREATE OR REPLACE FUNCTION public.get_pre_intercompany_close_check(p_entity uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
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
   SELECT coalesce(sum(amount),0) INTO v_recorded FROM public.finance_revenue_entries WHERE cycle_id=v_cycle.id AND as_of<=p_through;
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
END; $$;

-- Report-only approvals do not change entity books. Their own pending state must
-- not invalidate a consolidation's entity-close evidence during second review.

DO $$ DECLARE t text;f record;
BEGIN
 FOREACH t IN ARRAY ARRAY['finance_groups','finance_group_adjustments','finance_consolidations'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(org_id=public.get_user_org_id())',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS group_graph ON public.%I',t);EXECUTE format('CREATE CONSTRAINT TRIGGER group_graph AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_group_graph_trigger()',t);
 END LOOP;
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('validate_finance_group','require_finance_group','finance_fx_index','finance_fx_rate','get_consolidation_rate_requirements','group_income_translation','group_account_translation','finance_add_bucket','group_carrying_account','validate_group_adjustment','get_consolidation_report','validate_finance_extension','execute_finance_extension','finance_source_snapshot','validate_consolidation_graph','check_group_graph_trigger','guard_consolidated_cutoff','get_approved_consolidation','get_group_adjustment_sources','validate_intercompany_extension','execute_intercompany_extension','intercompany_source_snapshot','get_pre_intercompany_close_check') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);IF f.proname IN ('get_consolidation_rate_requirements','get_consolidation_report','get_approved_consolidation','get_group_adjustment_sources') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
