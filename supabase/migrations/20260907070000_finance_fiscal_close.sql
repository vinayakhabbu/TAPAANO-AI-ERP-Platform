BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.validate_schedule_extension(uuid,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.validate_finance_extension(uuid,text,jsonb) RENAME TO validate_schedule_extension;
  ALTER FUNCTION public.execute_finance_extension(public.finance_requests) RENAME TO execute_schedule_extension;
  ALTER FUNCTION public.finance_source_snapshot(uuid,text,jsonb) RENAME TO schedule_source_snapshot;
 END IF;
END; $$;
CREATE TABLE IF NOT EXISTS public.finance_year_closes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,
 starts_on date NOT NULL,ends_on date NOT NULL,retained_account_id uuid NOT NULL,
 request_id uuid NOT NULL,journal_id uuid REFERENCES public.journal_entries(id),lines jsonb NOT NULL,
 active boolean NOT NULL DEFAULT true,reopen_request uuid,reversal_journal uuid REFERENCES public.journal_entries(id),
 UNIQUE(org_id,id),UNIQUE(request_id),FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,retained_account_id) REFERENCES public.accounts(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,reopen_request) REFERENCES public.finance_requests(org_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_year_close_active ON public.finance_year_closes(entity_id,starts_on) WHERE active;
CREATE TABLE IF NOT EXISTS public.finance_close_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,
 period_id uuid NOT NULL REFERENCES public.accounting_periods(id),request_id uuid NOT NULL,target_status text NOT NULL,
 UNIQUE(request_id),FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id)
);

CREATE OR REPLACE FUNCTION public.get_finance_close_check(p_entity uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_trial jsonb;v_ar jsonb;v_ap jsonb;v_banks jsonb;v_assets jsonb;v_revenue jsonb;v_periods jsonb;v_s public.finance_schedules%ROWTYPE;v_cycle record;
 v_pending_schedules integer:=0;v_pending_usage integer:=0;v_unrecognized numeric:=0;v_earned numeric;v_recorded numeric;v_unresolved integer;v_pending_requests integer;v_missing_cash integer;v_can boolean;v_result jsonb;
BEGIN
 v_trial:=public.get_entity_trial_balance(p_entity,p_from,p_through)-'generatedAt';
 IF p_through>CURRENT_DATE THEN RAISE EXCEPTION 'a future period cannot be accepted as closed'; END IF;
 IF EXISTS(SELECT 1 FROM public.entity_invoice_account_controls WHERE entity_id=p_entity AND org_id=v_org) THEN v_ar:=public.get_subledger_aging(p_entity,'ar',p_through,0,1,NULL)-'generatedAt'-'rows'; END IF;
 IF EXISTS(SELECT 1 FROM public.entity_supplier_bill_account_controls WHERE entity_id=p_entity AND org_id=v_org) THEN v_ap:=public.get_subledger_aging(p_entity,'ap',p_through,0,1,NULL)-'generatedAt'-'rows'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('registerId',r.id,'name',r.name,'approvedThrough',s.ends_on,'statementId',s.id,'complete',coalesce(s.ends_on>=p_through,false)) ORDER BY r.id),'[]') INTO v_banks
 FROM public.cash_registers r LEFT JOIN LATERAL (SELECT id,ends_on FROM public.cash_statements WHERE register_id=r.id AND status='APPROVED' ORDER BY ends_on DESC,id LIMIT 1) s ON true WHERE r.entity_id=p_entity AND r.org_id=v_org;
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
 SELECT count(*) INTO v_pending_requests FROM public.finance_requests WHERE entity_id=p_entity AND org_id=v_org AND state='PENDING' AND kind NOT IN ('PERIOD_REVIEW','FISCAL_YEAR_CLOSE','FISCAL_YEAR_REOPEN');
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'startsOn',period_start,'endsOn',period_end,'status',status,'version',version) ORDER BY period_start,id),'[]') INTO v_periods FROM public.accounting_periods WHERE entity_id=p_entity AND org_id=v_org AND period_start<=p_through AND period_end>=p_from;
 v_can:=coalesce((v_ar->>'reconciled')::boolean,true) AND coalesce((v_ap->>'reconciled')::boolean,true) AND (v_trial->>'draftJournalCount')::integer=0 AND v_missing_cash=0
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_banks) b WHERE NOT (b->>'complete')::boolean)
  AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_assets||v_revenue) b WHERE (b->>'variance')::numeric<>0)
  AND v_pending_schedules=0 AND v_pending_usage=0 AND v_unrecognized=0 AND v_unresolved=0 AND v_pending_requests=0;
 v_result:=jsonb_build_object('entityId',p_entity,'from',p_from,'through',p_through,'trialBalance',v_trial,'ar',v_ar,'ap',v_ap,'banks',v_banks,'assetControls',v_assets,'revenueControls',v_revenue,'periods',v_periods,
  'unregisteredCashAccounts',v_missing_cash,'pendingSchedules',v_pending_schedules,'unfinalizedUsage',v_pending_usage,'unrecognizedRevenue',round(v_unrecognized,2)::text,'unresolvedProviderEvents',v_unresolved,'pendingFinanceRequests',v_pending_requests,'canClose',v_can);
 RETURN v_result||jsonb_build_object('revision',md5(v_result::text),'generatedAt',statement_timestamp());
END; $$;

CREATE OR REPLACE FUNCTION public.fiscal_closing_lines(p_entity uuid,p_from date,p_through date,p_retained uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_lines jsonb;v_net numeric;v_org uuid:=public.get_user_org_id();
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_retained AND org_id=v_org AND account_type='equity' AND is_active) THEN RAISE EXCEPTION 'active retained earnings equity account required'; END IF;
 IF EXISTS(SELECT 1 FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id JOIN public.accounts a ON a.id=l.account_id WHERE j.entity_id=p_entity AND j.org_id=v_org AND j.status='posted' AND j.entry_date<p_from AND a.account_type IN ('revenue','expense') GROUP BY l.account_id HAVING sum(l.debit-l.credit)<>0) THEN RAISE EXCEPTION 'close prior fiscal earnings before beginning this year'; END IF;
 WITH balances AS (SELECT l.account_id,sum(l.debit-l.credit) AS amount FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id JOIN public.accounts a ON a.id=l.account_id WHERE j.entity_id=p_entity AND j.org_id=v_org AND j.status='posted' AND j.entry_date<=p_through AND a.account_type IN ('revenue','expense') GROUP BY l.account_id HAVING sum(l.debit-l.credit)<>0)
 SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',account_id,'debit',round(greatest(-amount,0),2)::text,'credit',round(greatest(amount,0),2)::text) ORDER BY account_id),'[]'),coalesce(sum(amount),0) INTO v_lines,v_net FROM balances;
 IF v_net<>0 THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',p_retained,'debit',round(greatest(v_net,0),2)::text,'credit',round(greatest(-v_net,0),2)::text)); END IF;
 IF jsonb_array_length(v_lines)>500 THEN RAISE EXCEPTION 'fiscal closing exceeds the supported journal size'; END IF;
 RETURN v_lines;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_period public.accounting_periods%ROWTYPE;v_close public.finance_year_closes%ROWTYPE;v_from date;v_through date;v_check jsonb;v_days integer;
BEGIN
 IF p_kind NOT IN ('PERIOD_REVIEW','FISCAL_YEAR_CLOSE','FISCAL_YEAR_REOPEN') THEN RETURN public.validate_schedule_extension(p_entity,p_kind,p_payload); END IF;
 IF p_kind IN ('FISCAL_YEAR_CLOSE','FISCAL_YEAR_REOPEN') AND NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'fiscal closing and reopening require an administrator'; END IF;
 IF p_kind='PERIOD_REVIEW' THEN
  IF p_payload-ARRAY['period_id','expected_version','status','attestations']<>'{}'::jsonb OR coalesce(p_payload->>'status','') NOT IN ('OPEN','SOFT_CLOSED','HARD_CLOSED') THEN RAISE EXCEPTION 'invalid period review fields'; END IF;
  SELECT * INTO v_period FROM public.accounting_periods WHERE id=(p_payload->>'period_id')::uuid AND entity_id=p_entity AND org_id=v_org;
  IF v_period.id IS NULL OR v_period.version IS DISTINCT FROM (p_payload->>'expected_version')::int THEN RAISE EXCEPTION 'period changed or unavailable'; END IF;
  IF NOT ((v_period.status='OPEN' AND p_payload->>'status'='SOFT_CLOSED') OR (v_period.status='SOFT_CLOSED' AND p_payload->>'status' IN ('OPEN','HARD_CLOSED'))) THEN RAISE EXCEPTION 'only a soft-closed period can be reopened or permanently closed'; END IF;
  IF p_payload->>'status'='OPEN' THEN RETURN p_payload; END IF;
  v_from:=v_period.period_start;v_through:=v_period.period_end;
 ELSIF p_kind='FISCAL_YEAR_CLOSE' THEN
  IF p_payload-ARRAY['starts_on','ends_on','retained_account_id','attestations']<>'{}'::jsonb OR coalesce(p_payload->>'starts_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_payload->>'ends_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'invalid fiscal year fields'; END IF;
  v_from:=(p_payload->>'starts_on')::date;v_through:=(p_payload->>'ends_on')::date;
  IF v_through<v_from OR v_through-v_from>370 THEN RAISE EXCEPTION 'fiscal year must be a contiguous annual or initial short period'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_year_closes WHERE entity_id=p_entity AND active AND ends_on>=v_from) THEN RAISE EXCEPTION 'an active fiscal close overlaps or follows this year'; END IF;
  SELECT sum(period_end-period_start+1) INTO v_days FROM public.accounting_periods WHERE entity_id=p_entity AND org_id=v_org AND period_start>=v_from AND period_end<=v_through;
  IF v_days IS DISTINCT FROM v_through-v_from+1 OR NOT EXISTS(SELECT 1 FROM public.accounting_periods WHERE entity_id=p_entity AND period_end=v_through AND status='OPEN') THEN RAISE EXCEPTION 'fiscal dates must exactly cover configured periods with the final period open for closing entries'; END IF;
  PERFORM public.fiscal_closing_lines(p_entity,v_from,v_through,(p_payload->>'retained_account_id')::uuid);
 ELSE
  IF p_payload-ARRAY['close_id']<>'{}'::jsonb THEN RAISE EXCEPTION 'unknown fiscal reopening fields'; END IF;
  SELECT * INTO v_close FROM public.finance_year_closes WHERE id=(p_payload->>'close_id')::uuid AND entity_id=p_entity AND org_id=v_org AND active;
  IF v_close.id IS NULL OR EXISTS(SELECT 1 FROM public.finance_year_closes WHERE entity_id=p_entity AND active AND ends_on>v_close.ends_on) THEN RAISE EXCEPTION 'reopen the latest active fiscal close first'; END IF;
  IF EXISTS(SELECT 1 FROM public.accounting_periods WHERE entity_id=p_entity AND period_end=v_close.ends_on AND status='HARD_CLOSED') THEN RAISE EXCEPTION 'hard-closed fiscal years cannot be reopened'; END IF;
  RETURN p_payload;
 END IF;
 IF p_payload->'attestations' IS DISTINCT FROM jsonb_build_object('bank_sources_complete',true,'usage_and_contracts_complete',true,'unrecorded_liabilities_reviewed',true,'asset_policies_reviewed',true,'tax_and_opening_balances_reviewed',true) THEN RAISE EXCEPTION 'all close completeness attestations require explicit confirmation'; END IF;
 v_check:=public.get_finance_close_check(p_entity,v_from,v_through);
 IF NOT (v_check->>'canClose')::boolean THEN RAISE EXCEPTION 'close checks have unresolved balances, sources, schedules or approvals'; END IF;
 RETURN p_payload;
END; $$;

CREATE OR REPLACE FUNCTION public.finance_source_snapshot(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_period public.accounting_periods%ROWTYPE;v_close public.finance_year_closes%ROWTYPE;v_check jsonb;v_source jsonb;v_journal public.journal_entries%ROWTYPE;v_lines jsonb;
BEGIN
 IF p_kind='PERIOD_REVIEW' THEN
  SELECT * INTO v_period FROM public.accounting_periods WHERE id=(p_payload->>'period_id')::uuid AND entity_id=p_entity AND org_id=public.get_user_org_id();
  IF p_payload->>'status'='OPEN' THEN RETURN jsonb_build_object('period',v_period.id,'status',v_period.status,'version',v_period.version); END IF;
  RETURN public.get_finance_close_check(p_entity,v_period.period_start,v_period.period_end)-'generatedAt';
 ELSIF p_kind='FISCAL_YEAR_CLOSE' THEN
  v_check:=public.get_finance_close_check(p_entity,(p_payload->>'starts_on')::date,(p_payload->>'ends_on')::date)-'generatedAt';
  RETURN v_check||jsonb_build_object('closing_lines',public.fiscal_closing_lines(p_entity,(p_payload->>'starts_on')::date,(p_payload->>'ends_on')::date,(p_payload->>'retained_account_id')::uuid));
 ELSIF p_kind='FISCAL_YEAR_REOPEN' THEN
  SELECT * INTO v_close FROM public.finance_year_closes WHERE id=(p_payload->>'close_id')::uuid AND entity_id=p_entity AND org_id=public.get_user_org_id();
  SELECT * INTO v_period FROM public.accounting_periods WHERE entity_id=p_entity AND period_end=v_close.ends_on;
  RETURN jsonb_build_object('close',v_close.id,'starts_on',v_close.starts_on,'ends_on',v_close.ends_on,'active',v_close.active,'closing_lines',v_close.lines,'journal',v_close.journal_id,'period_status',v_period.status,'period_version',v_period.version);
 ELSIF p_kind IN ('JOURNAL_REVERSAL','SUPPLIER_PAYMENT_CORRECTION','SUPPLIER_PAYMENT_REPLACEMENT') THEN
  IF p_kind='JOURNAL_REVERSAL' THEN
   SELECT * INTO v_journal FROM public.journal_entries WHERE id=(p_payload->>'source_id')::uuid AND entity_id=p_entity AND org_id=public.get_user_org_id();
  ELSIF p_kind='SUPPLIER_PAYMENT_CORRECTION' THEN
   SELECT jsonb_build_object('id',id,'amount',amount::text,'currency',currency,'number',payment_number,'date',payment_date,'journal_id',journal_entry_id) INTO v_source FROM public.supplier_payments WHERE id=(p_payload->>'source_id')::uuid AND entity_id=p_entity AND org_id=public.get_user_org_id();
  ELSE
   SELECT jsonb_build_object('id',id,'amount',amount::text,'currency',currency,'number',correction_number,'date',correction_date,'journal_id',journal_entry_id) INTO v_source FROM public.supplier_payment_corrections WHERE id=(p_payload->>'source_id')::uuid AND entity_id=p_entity AND org_id=public.get_user_org_id();
  END IF;
  IF v_source IS NOT NULL THEN SELECT * INTO v_journal FROM public.journal_entries WHERE id=(v_source->>'journal_id')::uuid AND entity_id=p_entity AND org_id=public.get_user_org_id(); END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('account_id',account_id,'debit',debit::text,'credit',credit::text) ORDER BY id),'[]') INTO v_lines FROM public.journal_lines WHERE journal_entry_id=v_journal.id;
  RETURN jsonb_build_object('source',v_source,'journal_id',v_journal.id,'number',v_journal.entry_number,'date',v_journal.entry_date,'reversal_of',v_journal.reversal_of_id,'reversed_by',v_journal.reversed_by_id,'source_lines',v_lines);
 END IF;
 RETURN public.schedule_source_snapshot(p_entity,p_kind,p_payload);
END; $$;

CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p jsonb:=p_request.payload;v_period public.accounting_periods%ROWTYPE;v_close public.finance_year_closes%ROWTYPE;v_id uuid;v_journal uuid;v_lines jsonb;v_from date;v_through date;
BEGIN
 IF p_request.kind='PERIOD_REVIEW' THEN
  v_id:=public.change_accounting_period((v_p->>'period_id')::uuid,(v_p->>'expected_version')::int,v_p->>'status',p_request.reason,'finance:'||p_request.id);
  INSERT INTO public.finance_close_reviews(org_id,entity_id,period_id,request_id,target_status) VALUES(p_request.org_id,p_request.entity_id,v_id,p_request.id,v_p->>'status');
  RETURN jsonb_build_object('periodId',v_id,'status',v_p->>'status');
 ELSIF p_request.kind='FISCAL_YEAR_CLOSE' THEN
  v_from:=(v_p->>'starts_on')::date;v_through:=(v_p->>'ends_on')::date;
  v_lines:=public.fiscal_closing_lines(p_request.entity_id,v_from,v_through,(v_p->>'retained_account_id')::uuid);
  IF jsonb_array_length(v_lines)>0 THEN v_journal:=public.post_manual_journal(p_request.entity_id,'FISCAL-CLOSE-'||p_request.id,v_through,'Fiscal closing to retained earnings',v_lines,'finance:'||p_request.id||':year'); END IF;
  INSERT INTO public.finance_year_closes(org_id,entity_id,starts_on,ends_on,retained_account_id,request_id,journal_id,lines)
   VALUES(p_request.org_id,p_request.entity_id,v_from,v_through,(v_p->>'retained_account_id')::uuid,p_request.id,v_journal,v_lines) RETURNING id INTO v_id;
  FOR v_period IN SELECT * FROM public.accounting_periods WHERE entity_id=p_request.entity_id AND period_start>=v_from AND period_end<=v_through AND status='OPEN' ORDER BY period_start LOOP
   PERFORM public.change_accounting_period(v_period.id,v_period.version,'SOFT_CLOSED',p_request.reason,'finance:'||p_request.id||':'||v_period.id);
  END LOOP;
  RETURN jsonb_build_object('closeId',v_id,'journalId',v_journal);
 ELSIF p_request.kind='FISCAL_YEAR_REOPEN' THEN
  SELECT * INTO v_close FROM public.finance_year_closes WHERE id=(v_p->>'close_id')::uuid AND org_id=p_request.org_id;
  SELECT * INTO v_period FROM public.accounting_periods WHERE entity_id=p_request.entity_id AND period_end=v_close.ends_on;
  IF v_period.status='SOFT_CLOSED' THEN PERFORM public.change_accounting_period(v_period.id,v_period.version,'OPEN',p_request.reason,'finance:'||p_request.id||':period'); END IF;
  IF v_close.journal_id IS NOT NULL THEN v_journal:=public.reverse_posted_journal(v_close.journal_id,v_close.ends_on,left(p_request.reason,240),'finance:'||p_request.id||':year'); END IF;
  UPDATE public.finance_year_closes SET active=false,reopen_request=p_request.id,reversal_journal=v_journal WHERE id=v_close.id;
  RETURN jsonb_build_object('closeId',v_close.id,'reversalId',v_journal);
 END IF;
 RETURN public.execute_schedule_extension(p_request);
END; $$;

CREATE OR REPLACE FUNCTION public.guard_fiscal_cutoff()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_close public.finance_year_closes%ROWTYPE;v_r public.finance_requests%ROWTYPE;
BEGIN
 SELECT * INTO v_close FROM public.finance_year_closes WHERE entity_id=NEW.entity_id AND org_id=NEW.org_id AND active AND ends_on>=NEW.entry_date ORDER BY ends_on DESC LIMIT 1;
 IF v_close.id IS NOT NULL THEN
  SELECT * INTO v_r FROM public.finance_requests WHERE id=nullif(current_setting('tapaano.finance_request',true),'')::uuid AND state='EXECUTING' AND org_id=NEW.org_id AND entity_id=NEW.entity_id AND decided_by=auth.uid() AND requested_by<>auth.uid();
  IF v_r.id IS NULL OR v_r.kind<>'FISCAL_YEAR_REOPEN' OR v_r.payload->>'close_id'<>v_close.id::text OR NEW.reversal_of_id IS DISTINCT FROM v_close.journal_id THEN RAISE EXCEPTION 'reopen the fiscal close through independent review before backdated posting'; END IF;
 END IF;
 IF NEW.reversal_of_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.finance_year_closes WHERE journal_id=NEW.reversal_of_id) AND NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=nullif(current_setting('tapaano.finance_request',true),'')::uuid AND kind='FISCAL_YEAR_REOPEN' AND state='EXECUTING' AND decided_by=auth.uid() AND requested_by<>auth.uid()) THEN RAISE EXCEPTION 'fiscal closing journals require the fiscal reopening workflow'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS fiscal_posting_cutoff ON public.journal_entries;
CREATE TRIGGER fiscal_posting_cutoff BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_fiscal_cutoff();

CREATE OR REPLACE FUNCTION public.guard_reviewed_period_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status AND (
  EXISTS(SELECT 1 FROM public.finance_approval_policies WHERE entity_id=NEW.entity_id AND journals_required) OR
  EXISTS(SELECT 1 FROM public.finance_close_reviews WHERE entity_id=NEW.entity_id) OR EXISTS(SELECT 1 FROM public.finance_year_closes WHERE entity_id=NEW.entity_id)
 ) AND NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=nullif(current_setting('tapaano.finance_request',true),'')::uuid AND entity_id=NEW.entity_id AND org_id=NEW.org_id AND state='EXECUTING' AND kind IN ('PERIOD_REVIEW','FISCAL_YEAR_CLOSE','FISCAL_YEAR_REOPEN') AND decided_by=auth.uid() AND requested_by<>auth.uid()) THEN RAISE EXCEPTION 'period changes require independent finance review'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS reviewed_period_change ON public.accounting_periods;
CREATE TRIGGER reviewed_period_change BEFORE UPDATE ON public.accounting_periods FOR EACH ROW EXECUTE FUNCTION public.guard_reviewed_period_change();

CREATE OR REPLACE FUNCTION public.validate_fiscal_close_graph(p_close uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_c public.finance_year_closes%ROWTYPE;v_r public.finance_requests%ROWTYPE;
BEGIN
 SELECT * INTO v_c FROM public.finance_year_closes WHERE id=p_close;
 SELECT * INTO v_r FROM public.finance_requests WHERE id=v_c.request_id AND org_id=v_c.org_id AND entity_id=v_c.entity_id AND kind='FISCAL_YEAR_CLOSE' AND state IN ('APPROVED','EXECUTING');
 IF v_c.id IS NULL OR v_r.id IS NULL OR (v_r.payload->>'starts_on')::date IS DISTINCT FROM v_c.starts_on OR (v_r.payload->>'ends_on')::date IS DISTINCT FROM v_c.ends_on OR (v_r.payload->>'retained_account_id')::uuid IS DISTINCT FROM v_c.retained_account_id OR v_r.source_snapshot->'closing_lines' IS DISTINCT FROM v_c.lines THEN RAISE EXCEPTION 'fiscal closing source lineage mismatch'; END IF;
 IF jsonb_array_length(v_c.lines)=0 THEN
  IF v_c.journal_id IS NOT NULL OR v_c.reversal_journal IS NOT NULL THEN RAISE EXCEPTION 'empty fiscal close contains a journal'; END IF;
 ELSE
  PERFORM public.assert_finance_journal(v_c.journal_id,v_c.org_id,v_c.entity_id,v_c.ends_on,v_c.lines,v_c.reversal_journal,NULL);
  IF v_c.reversal_journal IS NOT NULL THEN PERFORM public.assert_finance_journal(v_c.reversal_journal,v_c.org_id,v_c.entity_id,v_c.ends_on,public.flip_finance_lines(v_c.lines),NULL,v_c.journal_id); END IF;
 END IF;
 IF v_c.active THEN
  IF v_c.reopen_request IS NOT NULL OR v_c.reversal_journal IS NOT NULL THEN RAISE EXCEPTION 'active fiscal close has reopening evidence'; END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_c.reopen_request AND org_id=v_c.org_id AND entity_id=v_c.entity_id AND kind='FISCAL_YEAR_REOPEN' AND state IN ('APPROVED','EXECUTING') AND payload->>'close_id'=v_c.id::text) OR (v_c.journal_id IS NOT NULL AND v_c.reversal_journal IS NULL) THEN RAISE EXCEPTION 'fiscal reopening source lineage mismatch'; END IF;
 END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.check_fiscal_close_graph_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.validate_fiscal_close_graph(NEW.id);RETURN NULL;END; $$;
DROP TRIGGER IF EXISTS fiscal_close_graph ON public.finance_year_closes;
CREATE CONSTRAINT TRIGGER fiscal_close_graph AFTER INSERT OR UPDATE ON public.finance_year_closes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_fiscal_close_graph_trigger();

CREATE OR REPLACE FUNCTION public.get_entity_trial_balance(
  p_entity_id uuid, p_from_date date, p_to_date date
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE v_org uuid:=public.get_user_org_id(); v_entity public.entities%ROWTYPE; v_result jsonb;
BEGIN
  IF auth.uid() IS NULL OR v_org IS NULL THEN
    RAISE EXCEPTION 'tenant membership is unavailable' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_entity FROM public.entities WHERE id=p_entity_id AND org_id=v_org;
  IF NOT FOUND THEN RAISE EXCEPTION 'entity not found or unavailable' USING ERRCODE='42501'; END IF;
  IF p_from_date IS NULL OR p_to_date IS NULL OR p_from_date>p_to_date
    OR p_from_date<DATE '0001-01-01' OR p_to_date>DATE '9999-12-31' THEN
    RAISE EXCEPTION 'invalid report date range';
  END IF;
  IF v_entity.currency IS NULL OR v_entity.currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'entity currency is unavailable';
  END IF;

  -- Recovered reversals retain the original POSTED journal and add an offset.
  -- A legacy REVERSED status has no reliable inclusion rule and needs review.
  IF EXISTS (SELECT 1 FROM public.journal_entries e WHERE e.org_id=v_org
    AND e.entity_id=p_entity_id AND e.entry_date<=p_to_date AND e.status='reversed') THEN
    RAISE EXCEPTION 'unverified reversed journal history prevents reporting';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.journal_entries e
    LEFT JOIN public.accounting_events ev ON ev.id=e.accounting_event_id
      AND ev.org_id=e.org_id AND ev.entity_id=e.entity_id AND ev.journal_entry_id=e.id
    LEFT JOIN public.accounting_periods p ON p.id=e.accounting_period_id
      AND p.org_id=e.org_id AND p.entity_id=e.entity_id
      AND e.entry_date BETWEEN p.period_start AND p.period_end
    WHERE e.org_id=v_org AND e.entity_id=p_entity_id AND e.status='posted'
      AND e.entry_date<=p_to_date AND (ev.id IS NULL OR p.id IS NULL)
  ) THEN RAISE EXCEPTION 'unverified posted journal history prevents reporting'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.journal_entries e
    LEFT JOIN public.journal_lines l ON l.journal_entry_id=e.id
    LEFT JOIN public.accounts a ON a.id=l.account_id AND a.org_id=e.org_id
    WHERE e.org_id=v_org AND e.entity_id=p_entity_id AND e.status='posted' AND e.entry_date<=p_to_date
    GROUP BY e.id
    HAVING count(l.id)<2 OR sum(l.debit) IS DISTINCT FROM sum(l.credit) OR sum(l.debit)<=0
      OR bool_or(a.id IS NULL OR l.org_id IS DISTINCT FROM e.org_id OR l.entity_id IS DISTINCT FROM e.entity_id
        OR l.debit IS NULL OR l.credit IS NULL OR l.debit<0 OR l.credit<0
        OR l.debit::text IN ('NaN','Infinity','-Infinity') OR l.credit::text IN ('NaN','Infinity','-Infinity')
        OR (l.debit=0 AND l.credit=0) OR (l.debit>0 AND l.credit>0))
  ) THEN RAISE EXCEPTION 'invalid or unbalanced journal history prevents reporting'; END IF;

  WITH activity AS (
    SELECT a.id,a.code,a.name,a.account_type,
      COALESCE(sum(l.debit-l.credit) FILTER (WHERE e.entry_date<p_from_date),0) AS opening,
      COALESCE(sum(l.debit) FILTER (WHERE e.entry_date>=p_from_date),0) AS period_debit,
      COALESCE(sum(l.credit) FILTER (WHERE e.entry_date>=p_from_date),0) AS period_credit,
      sum(l.debit-l.credit) AS closing
    FROM public.journal_entries e JOIN public.journal_lines l ON l.journal_entry_id=e.id
      JOIN public.accounts a ON a.id=l.account_id AND a.org_id=e.org_id
    WHERE e.org_id=v_org AND e.entity_id=p_entity_id AND e.status='posted' AND e.entry_date<=p_to_date
    GROUP BY a.id,a.code,a.name,a.account_type
  ), balances AS (
    SELECT *,GREATEST(opening,0) AS opening_debit,GREATEST(-opening,0) AS opening_credit,
      GREATEST(closing,0) AS closing_debit,GREATEST(-closing,0) AS closing_credit FROM activity
  )
  SELECT jsonb_build_object(
    'entityId',v_entity.id,'entityName',v_entity.name,'currency',v_entity.currency,
    'fromDate',to_char(p_from_date,'YYYY-MM-DD'),'toDate',to_char(p_to_date,'YYYY-MM-DD'),
    'generatedAt',statement_timestamp(),
    'journalCount',(SELECT count(*) FROM public.journal_entries WHERE org_id=v_org AND entity_id=p_entity_id AND status='posted' AND entry_date<=p_to_date),
    'periodJournalCount',(SELECT count(*) FROM public.journal_entries WHERE org_id=v_org AND entity_id=p_entity_id AND status='posted' AND entry_date BETWEEN p_from_date AND p_to_date),
    'draftJournalCount',(SELECT count(*) FROM public.journal_entries WHERE org_id=v_org AND entity_id=p_entity_id AND status='draft' AND entry_date<=p_to_date),
    'rows',COALESCE(jsonb_agg(jsonb_build_object(
      'accountId',id,'code',code,'name',name,'accountType',account_type,
      'openingDebit',opening_debit::numeric(38,2)::text,'openingCredit',opening_credit::numeric(38,2)::text,
      'periodDebit',period_debit::numeric(38,2)::text,'periodCredit',period_credit::numeric(38,2)::text,
      'closingDebit',closing_debit::numeric(38,2)::text,'closingCredit',closing_credit::numeric(38,2)::text
    ) ORDER BY code,id),'[]'::jsonb),
    'totals',jsonb_build_object(
      'openingDebit',COALESCE(sum(opening_debit),0)::numeric(38,2)::text,
      'openingCredit',COALESCE(sum(opening_credit),0)::numeric(38,2)::text,
      'periodDebit',COALESCE(sum(period_debit),0)::numeric(38,2)::text,
      'periodCredit',COALESCE(sum(period_credit),0)::numeric(38,2)::text,
      'closingDebit',COALESCE(sum(closing_debit),0)::numeric(38,2)::text,
      'closingCredit',COALESCE(sum(closing_credit),0)::numeric(38,2)::text
    )
  ) INTO v_result FROM balances;
  -- Identify only the fiscal transfers owned by the reviewed close workflow.
  -- Trial-balance amounts retain every posting; income presentation excludes these transfers.
  v_result:=v_result||jsonb_build_object('fiscalClosingActivity',(
    SELECT coalesce(jsonb_agg(jsonb_build_object('accountId',account_id,'debit',round(debit,2)::text,'credit',round(credit,2)::text) ORDER BY account_id),'[]'::jsonb)
    FROM (SELECT l.account_id,sum(l.debit) AS debit,sum(l.credit) AS credit
      FROM public.finance_year_closes c JOIN public.journal_entries j ON j.id=c.journal_id OR j.id=c.reversal_journal
      JOIN public.journal_lines l ON l.journal_entry_id=j.id
      WHERE c.org_id=v_org AND c.entity_id=p_entity_id AND j.org_id=v_org AND j.entity_id=p_entity_id AND j.status='posted' AND j.entry_date BETWEEN p_from_date AND p_to_date
      GROUP BY l.account_id) closing
  ));
  RETURN v_result || jsonb_build_object('revision',md5((v_result-'generatedAt')::text));
END;
$$;

DO $$ DECLARE t text;f record; BEGIN
 FOREACH t IN ARRAY ARRAY['finance_year_closes','finance_close_reviews'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(org_id=public.get_user_org_id())',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
 END LOOP;
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
  ('get_finance_close_check','fiscal_closing_lines','guard_fiscal_cutoff','guard_reviewed_period_change','validate_fiscal_close_graph','check_fiscal_close_graph_trigger','validate_schedule_extension','execute_schedule_extension','schedule_source_snapshot','validate_finance_extension','execute_finance_extension','finance_source_snapshot') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname='get_finance_close_check' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END; $$;
COMMIT;
