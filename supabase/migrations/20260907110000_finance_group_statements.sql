BEGIN;
DO $$ BEGIN IF to_regprocedure('public.get_core_consolidation_report(uuid,date,date,jsonb)') IS NULL THEN
 ALTER FUNCTION public.get_consolidation_report(uuid,date,date,jsonb) RENAME TO get_core_consolidation_report;
 ALTER FUNCTION public.validate_consolidation_graph(uuid) RENAME TO validate_core_consolidation_graph;
END IF;END; $$;

CREATE OR REPLACE FUNCTION public.group_cash_flow(p_group uuid,p_from date,p_through date,p_rates jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_g public.finance_groups%ROWTYPE;v_entity uuid;v_native jsonb;v_trial jsonb;v_index jsonb;v_source jsonb;v_allocation jsonb;v_allocations jsonb:='[]';v_sources jsonb:='[]';v_members jsonb:='[]';v_categories jsonb;v_open numeric:=0;v_close numeric:=0;v_movement numeric:=0;v_unknown numeric:=0;v_unknown_count integer:=0;v_before_open numeric;v_before_close numeric;v_classified numeric;v_rounding numeric;v_exchange numeric;v_rate numeric;v_converted numeric;v_eliminated boolean;v_complete boolean:=true;v_result jsonb;
BEGIN
 v_g:=public.require_finance_group(p_group,p_from,p_through);v_index:=public.finance_fx_index(p_rates);
 FOREACH v_entity IN ARRAY v_g.member_ids LOOP
  v_native:=public.get_entity_cash_flow(v_entity,p_from,p_through)-'generatedAt';v_trial:=public.get_entity_trial_balance(v_entity,p_from,p_through);
  v_complete:=v_complete AND (v_native->>'complete')::boolean;
  v_before_open:=v_open;v_before_close:=v_close;
  SELECT v_open+coalesce(sum(round(((r->>'openingDebit')::numeric-(r->>'openingCredit')::numeric)*public.finance_fx_rate(v_index,v_trial->>'currency',v_g.currency,'CLOSING',p_from-1),2)),0),v_close+coalesce(sum(round(((r->>'closingDebit')::numeric-(r->>'closingCredit')::numeric)*public.finance_fx_rate(v_index,v_trial->>'currency',v_g.currency,'CLOSING',p_through),2)),0) INTO v_open,v_close
   FROM jsonb_array_elements(v_trial->'rows')r WHERE r->>'accountId' IN (SELECT jsonb_array_elements_text(v_native->'cashAccounts'));
  v_members:=v_members||jsonb_build_array(jsonb_build_object('entityId',v_entity,'policyId',v_native->>'policyId','policyVersion',v_native->'policyVersion','revision',v_native->>'revision','complete',v_native->'complete','openingCash',round(v_open-v_before_open,2)::text,'closingCash',round(v_close-v_before_close,2)::text));
  FOR v_source IN SELECT value FROM jsonb_array_elements(v_native->'sources') LOOP
   v_rate:=public.finance_fx_rate(v_index,v_trial->>'currency',v_g.currency,'AVERAGE',date_trunc('month',(v_source->>'date')::date)::date);v_converted:=round((v_source->>'amount')::numeric*v_rate,2);v_movement:=v_movement+v_converted;
   SELECT EXISTS(SELECT 1 FROM public.finance_intercompany t WHERE t.org_id=v_g.org_id AND t.entity_id=ANY(v_g.member_ids) AND t.counterparty_id=ANY(v_g.member_ids) AND t.kind='FUNDING' AND (v_source->>'journalId')::uuid IN(t.seller_journal,t.buyer_journal,t.seller_reversal,t.buyer_reversal)) OR EXISTS(SELECT 1 FROM public.finance_intercompany_settlements s JOIN public.finance_intercompany t ON t.id=s.transfer_id WHERE t.org_id=v_g.org_id AND t.entity_id=ANY(v_g.member_ids) AND t.counterparty_id=ANY(v_g.member_ids) AND (v_source->>'journalId')::uuid IN(s.seller_journal,s.buyer_journal,s.seller_reversal,s.buyer_reversal)) INTO v_eliminated;
   v_sources:=v_sources||jsonb_build_array(v_source||jsonb_build_object('entityId',v_entity,'currency',v_trial->>'currency','rate',v_rate::text,'translatedAmount',round(v_converted,2)::text,'eliminated',v_eliminated));
   IF NOT v_eliminated THEN
    IF v_source->>'classificationId' IS NULL THEN v_unknown_count:=v_unknown_count+1;v_unknown:=v_unknown+v_converted;END IF;
    FOR v_allocation IN SELECT value FROM jsonb_array_elements(v_source->'allocations') LOOP
     v_allocations:=v_allocations||jsonb_build_array(jsonb_build_object('entity',v_entity,'month',date_trunc('month',(v_source->>'date')::date)::date,'category',v_allocation->>'category','amount',sign((v_source->>'amount')::numeric)*(v_allocation->>'amount')::numeric,'rate',v_rate));
    END LOOP;
   END IF;
  END LOOP;
 END LOOP;
 -- Aggregate category receipts and payments by entity/month before conversion.
 -- Keep line-versus-category rounding separate from exchange-rate effects.
 WITH translated AS (SELECT a->>'category' AS category,round(coalesce(sum((a->>'amount')::numeric) FILTER(WHERE (a->>'amount')::numeric>0),0)*(a->>'rate')::numeric,2) AS receipts,round(-coalesce(sum((a->>'amount')::numeric) FILTER(WHERE (a->>'amount')::numeric<0),0)*(a->>'rate')::numeric,2) AS payments FROM jsonb_array_elements(v_allocations)a GROUP BY a->>'entity',a->>'month',a->>'category',a->>'rate'), grouped AS (
 SELECT k.*,coalesce(sum(t.receipts),0) AS receipts,coalesce(sum(t.payments),0) AS payments FROM public.finance_cash_categories()k LEFT JOIN translated t ON t.category=k.category GROUP BY k.category,k.label,k.section,k.sort)
 SELECT jsonb_agg(jsonb_build_object('category',category,'label',label,'section',section,'receipts',round(receipts,2)::text,'payments',round(payments,2)::text,'net',round(receipts-payments,2)::text) ORDER BY sort) INTO v_categories FROM grouped;
 SELECT coalesce(sum((c->>'net')::numeric),0) INTO v_classified FROM jsonb_array_elements(v_categories)c;
 v_rounding:=v_movement-v_classified-v_unknown;v_exchange:=v_close-v_open-v_movement;
 v_result:=jsonb_build_object('groupId',v_g.id,'currency',v_g.currency,'from',p_from,'through',p_through,'openingCash',round(v_open,2)::text,'closingCash',round(v_close,2)::text,'translatedMovement',round(v_movement,2)::text,'classifiedMovement',round(v_classified,2)::text,'unclassifiedMovement',round(v_unknown,2)::text,'unclassifiedCount',v_unknown_count,'roundingDifference',round(v_rounding,2)::text,'exchangeEffect',round(v_exchange,2)::text,'categories',v_categories,'sources',v_sources,'members',v_members,'complete',v_complete AND v_unknown_count=0);
 RETURN v_result||jsonb_build_object('revision',md5(v_result::text));
END; $$;

CREATE OR REPLACE FUNCTION public.get_consolidation_report(p_group uuid,p_from date,p_through date,p_rates jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_core jsonb;v_g public.finance_groups%ROWTYPE;v_p public.finance_statement_policies%ROWTYPE;v_missing uuid[];v_configured boolean;v_statements jsonb;v_cash jsonb;v_balance numeric;v_complete boolean:=false;
BEGIN
 v_core:=public.get_core_consolidation_report(p_group,p_from,p_through,p_rates)-'revision'-'generatedAt';v_g:=public.require_finance_group(p_group,p_from,p_through);v_p:=public.latest_statement_policy(v_g.entity_id,v_g.id);
 SELECT coalesce(array_agg(e ORDER BY e),'{}') INTO v_missing FROM unnest(v_g.member_ids)e WHERE NOT EXISTS(SELECT 1 FROM public.finance_statement_policies WHERE entity_id=e AND group_id IS NULL AND org_id=v_g.org_id);
 v_configured:=v_p.id IS NOT NULL OR cardinality(v_missing)<cardinality(v_g.member_ids);
 IF v_p.id IS NOT NULL THEN v_statements:=public.apply_statement_policy(v_p.id,v_core->'rows');SELECT sum((s->>'total')::numeric) INTO v_balance FROM jsonb_array_elements(v_statements->'sections')s WHERE s->>'section' IN ('CASH','RESTRICTED_CASH_CURRENT','RESTRICTED_CASH_NONCURRENT');END IF;
 IF cardinality(v_missing)=0 THEN v_cash:=public.group_cash_flow(p_group,p_from,p_through,p_rates);END IF;
 v_complete:=v_p.id IS NOT NULL AND cardinality(v_missing)=0 AND coalesce((v_statements->>'complete')::boolean,false) AND coalesce((v_cash->>'complete')::boolean,false) AND v_balance=(v_cash->>'closingCash')::numeric;
 v_core:=v_core||jsonb_build_object('presentationConfigured',v_configured,'presentationComplete',v_complete,'missingStatementEntities',v_missing,'statements',v_statements,'cashFlow',v_cash,'cashBalanceAgrees',coalesce(v_balance=(v_cash->>'closingCash')::numeric,false),'canFinalize',(v_core->>'canFinalize')::boolean AND (NOT v_configured OR v_complete));
 RETURN v_core||jsonb_build_object('revision',md5(v_core::text),'generatedAt',statement_timestamp());
END; $$;

CREATE OR REPLACE FUNCTION public.validate_consolidation_graph(p_consolidation uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_r jsonb;v_c jsonb;v_s jsonb;v_p public.finance_statement_policies%ROWTYPE;v_sum numeric;
BEGIN
 PERFORM public.validate_core_consolidation_graph(p_consolidation);SELECT report INTO v_r FROM public.finance_consolidations WHERE id=p_consolidation;
 IF coalesce((v_r->>'presentationConfigured')::boolean,false) THEN
  v_c:=v_r->'cashFlow';v_s:=v_r->'statements';SELECT * INTO v_p FROM public.finance_statement_policies WHERE id=(v_s->>'policyId')::uuid;
  IF v_p.id IS NULL OR v_p.group_id IS DISTINCT FROM (v_r->>'groupId')::uuid OR v_s IS DISTINCT FROM public.apply_statement_policy(v_p.id,v_r->'rows') OR v_r->>'presentationComplete' IS DISTINCT FROM 'true' OR v_r->>'cashBalanceAgrees' IS DISTINCT FROM 'true' OR v_c->>'complete' IS DISTINCT FROM 'true' OR (v_c->>'unclassifiedCount')::int<>0 THEN RAISE EXCEPTION 'approved group statement presentation is incomplete';END IF;
  SELECT coalesce(sum((c->>'net')::numeric),0) INTO v_sum FROM jsonb_array_elements(v_c->'categories')c;
  IF v_sum IS DISTINCT FROM (v_c->>'classifiedMovement')::numeric OR (v_c->>'openingCash')::numeric+v_sum+(v_c->>'unclassifiedMovement')::numeric+(v_c->>'roundingDifference')::numeric+(v_c->>'exchangeEffect')::numeric IS DISTINCT FROM (v_c->>'closingCash')::numeric THEN RAISE EXCEPTION 'approved group cash flow does not reconcile';END IF;
 END IF;
END; $$;
DO $$ DECLARE f record;BEGIN
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('get_core_consolidation_report','validate_core_consolidation_graph','group_cash_flow','get_consolidation_report','validate_consolidation_graph') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);IF f.proname='get_consolidation_report' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
