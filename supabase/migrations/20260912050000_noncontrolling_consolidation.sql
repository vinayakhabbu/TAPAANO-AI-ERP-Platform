BEGIN;
LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF to_regprocedure('public.pre_ownership_validate(uuid,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.validate_finance_extension(uuid,text,jsonb) RENAME TO pre_ownership_validate;
  ALTER FUNCTION public.execute_finance_extension(public.finance_requests) RENAME TO pre_ownership_execute;
  ALTER FUNCTION public.get_core_consolidation_report(uuid,date,date,jsonb) RENAME TO pre_ownership_core_report;
  ALTER FUNCTION public.validate_consolidation_graph(uuid) RENAME TO pre_ownership_final_graph;
 END IF;
END; $$;
ALTER TABLE public.finance_group_adjustments ADD COLUMN IF NOT EXISTS attribution_entity uuid,ADD COLUMN IF NOT EXISTS attribution_evidence text;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='group_adjustment_attribution_entity') THEN ALTER TABLE public.finance_group_adjustments ADD CONSTRAINT group_adjustment_attribution_entity FOREIGN KEY(org_id,attribution_entity) REFERENCES public.entities(org_id,id);END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.validate_group_ownership_terms(p_parent uuid,p_terms jsonb,p_existing boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE item jsonb;account uuid;members uuid[];seen uuid[]:='{}';org uuid;
BEGIN
 SELECT org_id INTO org FROM public.entities WHERE id=p_parent;
 IF p_terms->>'ownership_basis' IS DISTINCT FROM 'CONTROLLED' THEN RAISE EXCEPTION 'controlled ownership terms required';END IF;
 members:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_terms->'member_ids') ORDER BY value::uuid);
 IF jsonb_typeof(p_terms->'ownership') IS DISTINCT FROM 'array' OR jsonb_array_length(p_terms->'ownership')<>cardinality(members) THEN RAISE EXCEPTION 'state direct ownership and control evidence for every group member';END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_terms->'ownership') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR item-ARRAY['entity_id','percentage','basis','evidence']<>'{}'::jsonb OR (item->>'entity_id')::uuid=ANY(seen) OR NOT coalesce((item->>'entity_id')::uuid=ANY(members),false) OR jsonb_typeof(item->'percentage') IS DISTINCT FROM 'string' OR coalesce(item->>'percentage','') !~ '^(0|[1-9][0-9]{0,2})(\.[0-9]{1,6})?$' OR (item->>'percentage')::numeric<=50 OR (item->>'percentage')::numeric>100 OR length(btrim(coalesce(item->>'evidence',''))) NOT BETWEEN 1 AND 2000 OR item->>'basis' IS DISTINCT FROM (CASE WHEN (item->>'entity_id')::uuid=p_parent THEN 'PARENT' ELSE 'ORDINARY_VOTING_SHARES' END) OR ((item->>'entity_id')::uuid=p_parent AND (item->>'percentage')::numeric<>100) THEN RAISE EXCEPTION 'ownership requires unique members, majority voting control and proportional ordinary-share rights';END IF;
  seen:=array_append(seen,(item->>'entity_id')::uuid);
 END LOOP;
 IF (p_terms->>'nci_account_id')::uuid IS NOT DISTINCT FROM (p_terms->>'parent_equity_account_id')::uuid OR (p_terms->>'cta_account_id')::uuid IN ((p_terms->>'nci_account_id')::uuid,(p_terms->>'parent_equity_account_id')::uuid) THEN RAISE EXCEPTION 'noncontrolling equity, parent allocation and translation use separate reserved accounts';END IF;
 FOREACH account IN ARRAY ARRAY[(p_terms->>'nci_account_id')::uuid,(p_terms->>'parent_equity_account_id')::uuid] LOOP
  IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=account AND org_id=org AND account_type='equity' AND (p_existing OR is_active)) OR EXISTS(SELECT 1 FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.entity_id=ANY(members) AND l.account_id=account) THEN RAISE EXCEPTION 'noncontrolling equity accounts must be reserved for consolidation';END IF;
 END LOOP;
END; $$;
CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE grp public.finance_groups%ROWTYPE;
BEGIN
 IF p_kind='GROUP_CREATE' AND p_payload->>'ownership_basis'='CONTROLLED' THEN
  PERFORM public.pre_tax_validate(p_entity,p_kind,(p_payload-ARRAY['ownership','nci_account_id','parent_equity_account_id'])||jsonb_build_object('ownership_basis','WHOLLY_OWNED'));
  PERFORM public.validate_group_ownership_terms(p_entity,p_payload);RETURN p_payload;
 ELSIF p_kind='GROUP_ADJUSTMENT' THEN
  SELECT * INTO grp FROM public.finance_groups WHERE id=(p_payload->>'group_id')::uuid AND org_id=public.get_user_org_id() AND entity_id=p_entity;
  IF grp.terms->>'ownership_basis'='CONTROLLED' THEN
   IF NOT coalesce((p_payload->>'attribution_entity')::uuid=ANY(grp.member_ids),false) OR length(btrim(coalesce(p_payload->>'attribution_evidence',''))) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'group adjustments require the member whose earnings and net assets they affect, with attribution evidence';END IF;
   IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'lines') a WHERE a->>'account_id' IN (grp.terms->>'nci_account_id',grp.terms->>'parent_equity_account_id')) THEN RAISE EXCEPTION 'noncontrolling equity attribution is computed from member sources';END IF;
   PERFORM public.pre_tax_validate(p_entity,p_kind,p_payload-ARRAY['attribution_entity','attribution_evidence']);RETURN p_payload;
  END IF;
 END IF;
 -- Group actions do not cross tax, contract revision or currency transaction validators.
 IF p_kind IN ('GROUP_CREATE','GROUP_ADJUSTMENT','GROUP_ADJUSTMENT_REVERSE','GROUP_CONSOLIDATE','GROUP_REOPEN') THEN RETURN public.pre_tax_validate(p_entity,p_kind,p_payload);END IF;
 IF p_kind IN ('CONTRACT_CREATE','CONTRACT_BILL','CONTRACT_USAGE_CLOSE','CONTRACT_RECOGNIZE') THEN RETURN public.pre_revision_validate(p_entity,p_kind,p_payload);END IF;
 RETURN public.pre_ownership_validate(p_entity,p_kind,p_payload);
END; $$;
CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF p_request.kind IN ('GROUP_CREATE','GROUP_ADJUSTMENT','GROUP_ADJUSTMENT_REVERSE','GROUP_CONSOLIDATE','GROUP_REOPEN') THEN result:=public.pre_tax_execute(p_request);ELSIF p_request.kind IN ('CONTRACT_CREATE','CONTRACT_BILL','CONTRACT_USAGE_CLOSE') THEN result:=public.pre_revision_execute(p_request);ELSIF p_request.kind='CONTRACT_RECOGNIZE' THEN result:=public.pre_fx_execute(p_request);ELSE result:=public.pre_ownership_execute(p_request);END IF;
 IF p_request.kind='GROUP_ADJUSTMENT' AND p_request.payload?'attribution_entity' THEN UPDATE public.finance_group_adjustments SET attribution_entity=(p_request.payload->>'attribution_entity')::uuid,attribution_evidence=p_request.payload->>'attribution_evidence' WHERE id=(result->>'adjustmentId')::uuid;END IF;
 RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION public.ownership_adjustment_sources(p_group uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a public.finance_group_adjustments%ROWTYPE;day date;direction integer;net_assets numeric;income numeric;result jsonb:='[]';
BEGIN
 FOR a IN SELECT * FROM public.finance_group_adjustments WHERE group_id=p_group AND as_of<=p_through ORDER BY as_of,id LOOP
  PERFORM public.validate_group_adjustment(a.id);
  FOR day,direction IN SELECT a.as_of,1 UNION ALL SELECT a.reversal_date,-1 WHERE a.reversal_date<=p_through LOOP
   SELECT coalesce(sum((l->>'debit')::numeric-(l->>'credit')::numeric) FILTER(WHERE account.account_type IN ('asset','liability')),0)*direction,-coalesce(sum((l->>'debit')::numeric-(l->>'credit')::numeric) FILTER(WHERE account.account_type IN ('revenue','expense')),0)*direction INTO net_assets,income FROM jsonb_array_elements(a.lines) l JOIN public.accounts account ON account.id=(l->>'account_id')::uuid;
   result:=result||jsonb_build_array(jsonb_build_object('adjustmentId',a.id,'entityId',a.attribution_entity,'date',day,'direction',direction,'netAssets',net_assets::numeric(38,2)::text,'netIncome',CASE WHEN day>=p_from THEN income ELSE 0 END::numeric(38,2)::text,'evidence',a.attribution_evidence,'requestId',a.request_id));
  END LOOP;
 END LOOP;RETURN result;
END; $$;
CREATE OR REPLACE FUNCTION public.group_ownership_attribution(p_group uuid,p_report jsonb,p_adjustments jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE grp public.finance_groups%ROWTYPE;member jsonb;term jsonb;rows jsonb:='[]';share numeric;net_assets numeric;income numeric;adjust_assets numeric;adjust_income numeric;nci_assets numeric;nci_income numeric;nci_cta numeric;total_assets numeric:=0;total_income numeric:=0;total_cta numeric:=0;
BEGIN
 SELECT * INTO grp FROM public.finance_groups WHERE id=p_group;
 FOR member IN SELECT value FROM jsonb_array_elements(p_report->'members') LOOP
  SELECT value INTO term FROM jsonb_array_elements(grp.terms->'ownership') WHERE value->>'entity_id'=member->>'entityId';share:=(100-(term->>'percentage')::numeric)/100;
  SELECT coalesce(sum((line->>'closing')::numeric) FILTER(WHERE account.account_type IN ('asset','liability')),0),-coalesce(sum((line->>'income')::numeric),0) INTO net_assets,income FROM jsonb_array_elements(member->'rows') line JOIN public.accounts account ON account.id=(line->>'accountId')::uuid;
  SELECT coalesce(sum((a->>'netAssets')::numeric),0),coalesce(sum((a->>'netIncome')::numeric),0) INTO adjust_assets,adjust_income FROM jsonb_array_elements(p_adjustments) a WHERE a->>'entityId'=member->>'entityId';
  nci_assets:=round((net_assets+adjust_assets)*share,2);nci_income:=round((income+adjust_income)*share,2);nci_cta:=round((member->>'translationAdjustment')::numeric*share,2);
  total_assets:=total_assets+nci_assets;total_income:=total_income+nci_income;total_cta:=total_cta+nci_cta;
  rows:=rows||jsonb_build_array(jsonb_build_object('entityId',member->>'entityId','parentPercentage',term->>'percentage','noncontrollingPercentage',(100-(term->>'percentage')::numeric)::numeric(9,6)::text,'sourceNetAssets',net_assets::numeric(38,2)::text,'sourceNetIncome',income::numeric(38,2)::text,'adjustedNetAssets',(net_assets+adjust_assets)::numeric(38,2)::text,'adjustedNetIncome',(income+adjust_income)::numeric(38,2)::text,'noncontrollingEquity',nci_assets::numeric(38,2)::text,'noncontrollingIncome',nci_income::numeric(38,2)::text,'noncontrollingTranslation',nci_cta::numeric(38,2)::text,'evidence',term->>'evidence'));
 END LOOP;
 RETURN jsonb_build_object('basis','CONTROLLED','groupRequestId',grp.request_id,'nciAccountId',grp.terms->>'nci_account_id','parentEquityAccountId',grp.terms->>'parent_equity_account_id','members',rows,'adjustments',p_adjustments,'noncontrollingEquity',total_assets::numeric(38,2)::text,'noncontrollingIncome',total_income::numeric(38,2)::text,'parentIncome',((p_report->>'netIncome')::numeric-total_income)::numeric(38,2)::text,'noncontrollingTranslation',total_cta::numeric(38,2)::text,'parentTranslation',((p_report->>'translationAdjustment')::numeric-total_cta)::numeric(38,2)::text);
END; $$;
CREATE OR REPLACE FUNCTION public.get_core_consolidation_report(p_group uuid,p_from date,p_through date,p_rates jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;grp public.finance_groups%ROWTYPE;ownership jsonb;account uuid;amount numeric;row jsonb;rows jsonb;
BEGIN
 result:=public.pre_ownership_core_report(p_group,p_from,p_through,p_rates);SELECT * INTO grp FROM public.finance_groups WHERE id=p_group;
 IF grp.terms->>'ownership_basis'<>'CONTROLLED' THEN RETURN result;END IF;
 ownership:=public.group_ownership_attribution(p_group,result,public.ownership_adjustment_sources(p_group,p_from,p_through));rows:=result->'rows';
 FOREACH account IN ARRAY ARRAY[(grp.terms->>'nci_account_id')::uuid,(grp.terms->>'parent_equity_account_id')::uuid] LOOP
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(rows) a WHERE a->>'accountId'=account::text) THEN RAISE EXCEPTION 'noncontrolling attribution accounts contain unexpected source activity';END IF;
  amount:=(ownership->>'noncontrollingEquity')::numeric*CASE WHEN account=(grp.terms->>'nci_account_id')::uuid THEN -1 ELSE 1 END;
  SELECT jsonb_build_object('accountId',id,'code',code,'name',name,'accountType','equity','sourceClosing','0.00','automaticClosing','0.00','adjustmentClosing',amount::numeric(38,2)::text,'translationClosing','0.00','closing',amount::numeric(38,2)::text,'sourceIncome','0.00','automaticIncome','0.00','adjustmentIncome','0.00','income','0.00') INTO row FROM public.accounts WHERE id=account;
  rows:=rows||jsonb_build_array(row);
 END LOOP;
 SELECT jsonb_agg(a ORDER BY a->>'code',a->>'accountId') INTO rows FROM jsonb_array_elements(rows) a;
 result:=(result-'revision'-'generatedAt')||jsonb_build_object('rows',rows,'ownership',ownership);
 RETURN result||jsonb_build_object('revision',md5(result::text),'generatedAt',statement_timestamp());
END; $$;

CREATE OR REPLACE FUNCTION public.validate_finance_group(p_group uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_g public.finance_groups%ROWTYPE;
BEGIN
 SELECT * INTO v_g FROM public.finance_groups WHERE id=p_group;
 IF v_g.id IS NULL OR coalesce(v_g.terms->>'ownership_basis','') NOT IN ('WHOLLY_OWNED','CONTROLLED') OR v_g.reference IS DISTINCT FROM v_g.terms->>'reference' OR v_g.name IS DISTINCT FROM v_g.terms->>'name' OR v_g.currency IS DISTINCT FROM v_g.terms->>'currency' OR v_g.starts_on IS DISTINCT FROM (v_g.terms->>'starts_on')::date OR v_g.cta_account_id IS DISTINCT FROM (v_g.terms->>'cta_account_id')::uuid OR
  v_g.member_ids IS DISTINCT FROM ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(v_g.terms->'member_ids') ORDER BY value::uuid) THEN RAISE EXCEPTION 'reporting group definition mismatch'; END IF;
 IF cardinality(v_g.member_ids) NOT BETWEEN 2 AND 25 OR NOT (v_g.entity_id=ANY(v_g.member_ids)) OR (SELECT count(DISTINCT id) FROM public.entities WHERE id=ANY(v_g.member_ids) AND org_id=v_g.org_id)<>cardinality(v_g.member_ids) THEN RAISE EXCEPTION 'group membership lineage mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_g.request_id AND org_id=v_g.org_id AND entity_id=v_g.entity_id AND kind='GROUP_CREATE' AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by AND payload=v_g.terms) OR
    NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=v_g.cta_account_id AND org_id=v_g.org_id AND account_type='equity') THEN RAISE EXCEPTION 'group approval or translation-account lineage mismatch'; END IF;
 IF v_g.terms->>'ownership_basis'='CONTROLLED' THEN PERFORM public.validate_group_ownership_terms(v_g.entity_id,v_g.terms,true);END IF;
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
 IF v_g.terms->>'ownership_basis'='CONTROLLED' THEN
  IF v_a.attribution_entity IS DISTINCT FROM (v_r.payload->>'attribution_entity')::uuid OR NOT coalesce(v_a.attribution_entity=ANY(v_g.member_ids),false) OR v_a.attribution_evidence IS DISTINCT FROM v_r.payload->>'attribution_evidence' OR length(btrim(coalesce(v_a.attribution_evidence,''))) NOT BETWEEN 1 AND 2000 OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_a.lines) a WHERE a->>'account_id' IN (v_g.terms->>'nci_account_id',v_g.terms->>'parent_equity_account_id')) THEN RAISE EXCEPTION 'group adjustment ownership attribution is invalid';END IF;
 ELSIF v_a.attribution_entity IS NOT NULL OR v_a.attribution_evidence IS NOT NULL THEN RAISE EXCEPTION 'unexpected group ownership attribution';END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_consolidation_graph(p_consolidation uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c public.finance_consolidations%ROWTYPE;grp public.finance_groups%ROWTYPE;ownership jsonb;expected jsonb;adjustment jsonb;a public.finance_group_adjustments%ROWTYPE;net_assets numeric;income numeric;amount numeric;
BEGIN
 PERFORM public.pre_ownership_final_graph(p_consolidation);SELECT * INTO c FROM public.finance_consolidations WHERE id=p_consolidation;SELECT * INTO grp FROM public.finance_groups WHERE id=c.group_id;
 IF grp.terms->>'ownership_basis'<>'CONTROLLED' THEN RETURN;END IF;
 ownership:=c.report->'ownership';
 IF jsonb_typeof(ownership) IS DISTINCT FROM 'object' OR jsonb_typeof(ownership->'adjustments') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'approved group ownership attribution is missing';END IF;
 FOR adjustment IN SELECT value FROM jsonb_array_elements(ownership->'adjustments') LOOP
  SELECT * INTO a FROM public.finance_group_adjustments WHERE id=(adjustment->>'adjustmentId')::uuid AND group_id=grp.id;PERFORM public.validate_group_adjustment(a.id);
  SELECT coalesce(sum((l->>'debit')::numeric-(l->>'credit')::numeric) FILTER(WHERE account.account_type IN ('asset','liability')),0)*(adjustment->>'direction')::int,-coalesce(sum((l->>'debit')::numeric-(l->>'credit')::numeric) FILTER(WHERE account.account_type IN ('revenue','expense')),0)*(adjustment->>'direction')::int INTO net_assets,income FROM jsonb_array_elements(a.lines) l JOIN public.accounts account ON account.id=(l->>'account_id')::uuid;
  IF adjustment IS DISTINCT FROM jsonb_build_object('adjustmentId',a.id,'entityId',a.attribution_entity,'date',(adjustment->>'date')::date,'direction',(adjustment->>'direction')::int,'netAssets',net_assets::numeric(38,2)::text,'netIncome',CASE WHEN (adjustment->>'date')::date>=c.starts_on THEN income ELSE 0 END::numeric(38,2)::text,'evidence',a.attribution_evidence,'requestId',a.request_id) OR NOT ((adjustment->>'direction'='1' AND (adjustment->>'date')::date=a.as_of) OR (adjustment->>'direction'='-1' AND (adjustment->>'date')::date=a.reversal_date)) OR (adjustment->>'date')::date>c.ends_on THEN RAISE EXCEPTION 'retained ownership adjustment source is invalid';END IF;
 END LOOP;
 IF c.active AND ownership->'adjustments' IS DISTINCT FROM public.ownership_adjustment_sources(grp.id,c.starts_on,c.ends_on) THEN RAISE EXCEPTION 'active ownership attribution omitted an approved adjustment';END IF;
 expected:=public.group_ownership_attribution(grp.id,c.report,ownership->'adjustments');IF ownership IS DISTINCT FROM expected THEN RAISE EXCEPTION 'parent and noncontrolling attribution does not reconcile to approved ownership and member sources';END IF;
 amount:=(ownership->>'noncontrollingEquity')::numeric;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.report->'rows') r WHERE r->>'accountId'=grp.terms->>'nci_account_id' AND (r->>'closing')::numeric=-amount AND (r->>'adjustmentClosing')::numeric=-amount) OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(c.report->'rows') r WHERE r->>'accountId'=grp.terms->>'parent_equity_account_id' AND (r->>'closing')::numeric=amount AND (r->>'adjustmentClosing')::numeric=amount) THEN RAISE EXCEPTION 'noncontrolling equity reclassification is invalid';END IF;
END; $$;
-- These accounts only exist in the consolidated report. Reject source posting
-- immediately so later activity cannot invalidate a retained ownership snapshot.
CREATE OR REPLACE FUNCTION public.guard_ownership_source_accounts()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.journal_entries j JOIN public.finance_groups g ON g.org_id=j.org_id AND j.entity_id=ANY(g.member_ids) WHERE j.id=NEW.journal_entry_id AND g.terms->>'ownership_basis'='CONTROLLED' AND NEW.account_id::text IN (g.terms->>'nci_account_id',g.terms->>'parent_equity_account_id')) THEN RAISE EXCEPTION 'ownership equity accounts are reserved for group reports; choose a source-book equity account';END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS guard_ownership_source_accounts ON public.journal_lines;
CREATE TRIGGER guard_ownership_source_accounts BEFORE INSERT OR UPDATE OF account_id,journal_entry_id ON public.journal_lines FOR EACH ROW EXECUTE FUNCTION public.guard_ownership_source_accounts();
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('guard_ownership_source_accounts','pre_ownership_validate','pre_ownership_execute','pre_ownership_core_report','pre_ownership_final_graph','validate_group_ownership_terms','validate_finance_extension','execute_finance_extension','ownership_adjustment_sources','group_ownership_attribution','get_core_consolidation_report','validate_finance_group','validate_group_adjustment','validate_consolidation_graph') LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);END LOOP;
END; $$;
COMMIT;
