BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.validate_integration_extension(uuid,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.validate_finance_extension(uuid,text,jsonb) RENAME TO validate_integration_extension;
  ALTER FUNCTION public.execute_finance_extension(public.finance_requests) RENAME TO execute_integration_extension;
  ALTER FUNCTION public.finance_source_snapshot(uuid,text,jsonb) RENAME TO integration_source_snapshot;
 END IF;
END; $$;

CREATE TABLE IF NOT EXISTS public.finance_schedules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,
 reference text NOT NULL,kind text NOT NULL CHECK(kind IN ('PREPAID','FIXED_ASSET','RECURRING','ACCRUAL')),
 currency text NOT NULL,terms jsonb NOT NULL,cost numeric(15,2),source_line_id uuid REFERENCES public.journal_lines(id),
 creation_request uuid NOT NULL,cancel_request uuid,state text NOT NULL DEFAULT 'ACTIVE' CHECK(state IN ('ACTIVE','CANCELLED','DISPOSED')),
 UNIQUE(org_id,id),UNIQUE(org_id,entity_id,reference),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,creation_request) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,cancel_request) REFERENCES public.finance_requests(org_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_schedule_acquisition_unique ON public.finance_schedules(source_line_id) WHERE state<>'CANCELLED';
CREATE TABLE IF NOT EXISTS public.finance_schedule_entries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,schedule_id uuid NOT NULL,
 slot text NOT NULL,kind text NOT NULL CHECK(kind IN ('EXPENSE','RECURRING','ACCRUAL','REVERSAL','DISPOSAL')),
 as_of date NOT NULL,amount numeric(15,2) NOT NULL DEFAULT 0,journal_id uuid NOT NULL REFERENCES public.journal_entries(id),
 request_id uuid NOT NULL,details jsonb NOT NULL,reversal_journal uuid REFERENCES public.journal_entries(id),reversal_date date,reversal_request uuid,
 UNIQUE(org_id,id),UNIQUE(schedule_id,slot),UNIQUE(journal_id),
 FOREIGN KEY(org_id,schedule_id) REFERENCES public.finance_schedules(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,reversal_request) REFERENCES public.finance_requests(org_id,id),
 CHECK((reversal_journal IS NULL AND reversal_date IS NULL AND reversal_request IS NULL) OR (reversal_journal IS NOT NULL AND reversal_date>=as_of AND reversal_request IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_schedule_active_disposal ON public.finance_schedule_entries(schedule_id) WHERE kind='DISPOSAL' AND reversal_journal IS NULL;

CREATE OR REPLACE FUNCTION public.schedule_earned(p_schedule public.finance_schedules,p_date date)
RETURNS numeric LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT round((p_schedule.cost-coalesce((p_schedule.terms->>'salvage')::numeric,0))*greatest(0,least(p_date,(p_schedule.terms->>'ends_on')::date)-(p_schedule.terms->>'starts_on')::date+1)/((p_schedule.terms->>'ends_on')::date-(p_schedule.terms->>'starts_on')::date+1),2)
$$;
CREATE OR REPLACE FUNCTION public.schedule_expensed(p_schedule uuid,p_date date)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(sum(CASE WHEN as_of<=p_date THEN amount ELSE 0 END-CASE WHEN reversal_date<=p_date THEN amount ELSE 0 END),0) FROM public.finance_schedule_entries WHERE schedule_id=p_schedule AND kind='EXPENSE'
$$;
CREATE OR REPLACE FUNCTION public.schedule_pending_dates(p_schedule public.finance_schedules,p_through date)
RETURNS SETOF date LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_date date;v_n integer:=0;v_start date:=(p_schedule.terms->>'starts_on')::date;v_end date:=(p_schedule.terms->>'ends_on')::date;
BEGIN
 IF p_schedule.state<>'ACTIVE' THEN RETURN; END IF;
 IF p_schedule.kind='ACCRUAL' THEN
  FOR v_date IN SELECT unnest(ARRAY[v_start,v_end]) LOOP
   IF v_date<=p_through AND NOT EXISTS(SELECT 1 FROM public.finance_schedule_entries WHERE schedule_id=p_schedule.id AND slot='date:'||v_date) THEN RETURN NEXT v_date; END IF;
  END LOOP;RETURN;
 END IF;
 LOOP
  v_date:=(v_start+make_interval(months=>v_n*(p_schedule.terms->>'cycle_months')::int))::date;
  EXIT WHEN v_date>v_end OR v_date>p_through;
  IF NOT EXISTS(SELECT 1 FROM public.finance_schedule_entries WHERE schedule_id=p_schedule.id AND slot='date:'||v_date) THEN RETURN NEXT v_date; END IF;
  v_n:=v_n+1;IF v_n>600 THEN RAISE EXCEPTION 'schedule exceeds 600 occurrences'; END IF;
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_s public.finance_schedules%ROWTYPE;v_e public.finance_schedule_entries%ROWTYPE;v_source record;v_start date;v_end date;v_date date;v_asset uuid;v_amount numeric;v_lines jsonb;
BEGIN
 IF p_kind='SCHEDULE_CREATE' THEN
  IF p_payload-ARRAY['reference','kind','starts_on','ends_on','source_line_id','salvage','expense_account_id','accumulated_account_id','lines','cycle_months']<>'{}'::jsonb OR
   length(coalesce(p_payload->>'reference','')) NOT BETWEEN 1 AND 80 OR coalesce(p_payload->>'kind','') NOT IN ('PREPAID','FIXED_ASSET','RECURRING','ACCRUAL') OR
   coalesce(p_payload->>'starts_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_payload->>'ends_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'invalid schedule terms'; END IF;
  v_start:=(p_payload->>'starts_on')::date;v_end:=(p_payload->>'ends_on')::date;
  IF v_start<DATE '0001-01-01' OR v_end>DATE '9999-12-31' OR v_end<v_start OR v_end>=v_start+interval '50 years' THEN RAISE EXCEPTION 'schedule dates must span at most 50 years'; END IF;
  IF EXISTS(SELECT 1 FROM public.finance_schedules WHERE org_id=v_org AND entity_id=p_entity AND reference=p_payload->>'reference') THEN RAISE EXCEPTION 'schedule reference already exists'; END IF;
  IF p_payload->>'kind' IN ('PREPAID','FIXED_ASSET') THEN
   IF p_payload-ARRAY['reference','kind','starts_on','ends_on','source_line_id','salvage','expense_account_id','accumulated_account_id']<>'{}'::jsonb OR (p_payload->>'kind'='PREPAID' AND p_payload ? 'accumulated_account_id') THEN RAISE EXCEPTION 'unknown asset schedule fields'; END IF;
   SELECT l.id,l.account_id,l.journal_entry_id,l.debit-l.credit AS amount,j.entry_date,j.reversed_by_id,j.reversal_of_id INTO v_source FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id JOIN public.accounts a ON a.id=l.account_id
    WHERE l.id=(p_payload->>'source_line_id')::uuid AND j.org_id=v_org AND j.entity_id=p_entity AND j.status='posted' AND a.account_type='asset' AND a.is_active;
   IF v_source.id IS NULL OR v_source.amount<=0 OR v_source.reversed_by_id IS NOT NULL OR v_source.reversal_of_id IS NOT NULL OR v_source.entry_date>v_start OR EXISTS(SELECT 1 FROM public.finance_schedules WHERE source_line_id=v_source.id AND state<>'CANCELLED') OR EXISTS(SELECT 1 FROM public.finance_schedule_entries WHERE journal_id=v_source.journal_entry_id OR reversal_journal=v_source.journal_entry_id) THEN RAISE EXCEPTION 'unassigned posted asset acquisition debit required'; END IF;
   PERFORM public.get_entity_trial_balance(p_entity,DATE '0001-01-01',v_start);
   IF EXISTS(SELECT 1 FROM public.cash_registers WHERE entity_id=p_entity AND account_id=v_source.account_id) OR EXISTS(SELECT 1 FROM public.entity_customer_receipt_controls WHERE entity_id=p_entity AND v_source.account_id IN (cash_account_id,ar_account_id)) OR EXISTS(SELECT 1 FROM public.finance_connections WHERE entity_id=p_entity AND clearing_account_id=v_source.account_id) OR EXISTS(SELECT 1 FROM public.finance_contracts WHERE entity_id=p_entity AND terms->>'unbilled_account_id'=v_source.account_id::text) THEN RAISE EXCEPTION 'cash and receivable control accounts cannot be amortized as assets'; END IF;
   IF jsonb_typeof(p_payload->'salvage') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'exact residual value required'; END IF;
   v_amount:=public.cash_amount(p_payload->>'salvage');
   IF v_amount<0 OR v_amount>=v_source.amount OR (p_payload->>'kind'='PREPAID' AND v_amount<>0) THEN RAISE EXCEPTION 'invalid residual value'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(p_payload->>'expense_account_id')::uuid AND org_id=v_org AND is_active AND account_type='expense') THEN RAISE EXCEPTION 'active expense account required'; END IF;
   IF p_payload->>'kind'='FIXED_ASSET' AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(p_payload->>'accumulated_account_id')::uuid AND id<>v_source.account_id AND org_id=v_org AND is_active AND account_type='asset') THEN RAISE EXCEPTION 'distinct accumulated depreciation asset account required'; END IF;
  ELSE
   IF p_payload-ARRAY['reference','kind','starts_on','ends_on','lines','cycle_months']<>'{}'::jsonb OR (p_payload->>'kind'='ACCRUAL' AND p_payload ? 'cycle_months') THEN RAISE EXCEPTION 'unknown recurring schedule fields'; END IF;
   IF (p_payload->>'kind'='RECURRING' AND coalesce(p_payload->>'cycle_months','') NOT IN ('1','3','12')) OR (p_payload->>'kind'='ACCRUAL' AND v_end<=v_start) THEN RAISE EXCEPTION 'recurrence or subsequent accrual reversal date required'; END IF;
   PERFORM public.validate_finance_request(p_entity,'MANUAL_JOURNAL',jsonb_build_object('number',p_payload->>'reference','date',p_payload->>'starts_on','memo','Scheduled finance journal','lines',p_payload->'lines'));
  END IF;
  RETURN p_payload;
 ELSIF p_kind NOT IN ('SCHEDULE_RUN','SCHEDULE_CANCEL','SCHEDULE_CORRECT','ASSET_DISPOSE','ASSET_RESTORE') THEN RETURN public.validate_integration_extension(p_entity,p_kind,p_payload); END IF;
 SELECT * INTO v_s FROM public.finance_schedules WHERE id=(p_payload->>'schedule_id')::uuid AND entity_id=p_entity AND org_id=v_org;
 IF v_s.id IS NULL THEN RAISE EXCEPTION 'schedule unavailable'; END IF;
 IF p_kind='SCHEDULE_CANCEL' THEN
  IF p_payload-ARRAY['schedule_id']<>'{}'::jsonb OR v_s.state<>'ACTIVE' OR (v_s.kind IN ('PREPAID','FIXED_ASSET') AND EXISTS(SELECT 1 FROM public.finance_schedule_entries WHERE schedule_id=v_s.id)) OR (v_s.kind='ACCRUAL' AND EXISTS(SELECT 1 FROM public.finance_schedule_entries WHERE schedule_id=v_s.id AND kind='ACCRUAL') AND NOT EXISTS(SELECT 1 FROM public.finance_schedule_entries WHERE schedule_id=v_s.id AND kind='REVERSAL')) THEN RAISE EXCEPTION 'asset with postings or outstanding accrual cannot be cancelled'; END IF;
  IF v_s.kind='RECURRING' AND EXISTS(SELECT 1 FROM public.schedule_pending_dates(v_s,CURRENT_DATE)) THEN RAISE EXCEPTION 'resolve overdue recurring occurrences before cancelling future dates'; END IF;RETURN p_payload;
 END IF;
 IF coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'schedule accounting date required'; END IF;
 v_date:=(p_payload->>'date')::date;
 IF v_date>CURRENT_DATE OR v_date<(v_s.terms->>'starts_on')::date THEN RAISE EXCEPTION 'schedule date cannot precede service or be in the future'; END IF;
 IF p_kind='ASSET_RESTORE' THEN
  IF p_payload-ARRAY['schedule_id','date']<>'{}'::jsonb OR v_s.state<>'DISPOSED' OR NOT EXISTS(SELECT 1 FROM public.finance_schedule_entries WHERE schedule_id=v_s.id AND kind='DISPOSAL' AND reversal_journal IS NULL AND as_of=v_date) THEN RAISE EXCEPTION 'disposal must be restored on its original open accounting date'; END IF;RETURN p_payload;
 END IF;
 IF v_s.state<>'ACTIVE' THEN RAISE EXCEPTION 'schedule is not active'; END IF;
 IF p_kind='SCHEDULE_CORRECT' THEN
  IF p_payload-ARRAY['schedule_id','entry_id','date']<>'{}'::jsonb OR v_s.kind='ACCRUAL' THEN RAISE EXCEPTION 'use the accrual reversal schedule'; END IF;
  SELECT * INTO v_e FROM public.finance_schedule_entries WHERE id=(p_payload->>'entry_id')::uuid AND schedule_id=v_s.id AND kind IN ('EXPENSE','RECURRING') AND reversal_journal IS NULL;
  IF v_e.id IS NULL OR v_date<v_e.as_of OR EXISTS(SELECT 1 FROM public.finance_schedule_entries WHERE schedule_id=v_s.id AND (as_of>v_e.as_of OR reversal_date>v_date)) THEN RAISE EXCEPTION 'correct the latest schedule entry first'; END IF;RETURN p_payload;
 END IF;
 IF EXISTS(SELECT 1 FROM public.finance_schedule_entries WHERE schedule_id=v_s.id AND (as_of>v_date OR reversal_date>v_date)) THEN RAISE EXCEPTION 'schedule postings must advance in date order'; END IF;
 IF p_kind='SCHEDULE_RUN' THEN
  IF p_payload-ARRAY['schedule_id','date']<>'{}'::jsonb THEN RAISE EXCEPTION 'unknown schedule run fields'; END IF;
  IF v_s.kind IN ('PREPAID','FIXED_ASSET') THEN
   IF public.schedule_earned(v_s,v_date)-public.schedule_expensed(v_s.id,v_date)<=0 THEN RAISE EXCEPTION 'no additional scheduled expense'; END IF;
  ELSIF NOT EXISTS(SELECT 1 FROM public.schedule_pending_dates(v_s,v_date)) THEN RAISE EXCEPTION 'no pending schedule occurrences';
  ELSIF (SELECT count(*) FROM public.schedule_pending_dates(v_s,v_date))>120 THEN RAISE EXCEPTION 'choose an earlier through-date to process at most 120 occurrences per approval'; END IF;
 ELSE
  IF p_payload-ARRAY['schedule_id','date','proceeds','proceeds_account_id','gain_account_id','loss_account_id']<>'{}'::jsonb OR v_s.kind NOT IN ('PREPAID','FIXED_ASSET') OR jsonb_typeof(p_payload->'proceeds') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'invalid asset disposal'; END IF;
  v_amount:=public.cash_amount(p_payload->>'proceeds');IF v_amount<0 THEN RAISE EXCEPTION 'disposal proceeds cannot be negative'; END IF;
  IF v_amount>0 AND NOT EXISTS(SELECT 1 FROM public.accounts WHERE org_id=v_org AND id=(p_payload->>'proceeds_account_id')::uuid AND is_active AND account_type='asset') THEN RAISE EXCEPTION 'active disposal proceeds account required'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE org_id=v_org AND id=(p_payload->>'gain_account_id')::uuid AND is_active AND account_type='revenue') OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE org_id=v_org AND id=(p_payload->>'loss_account_id')::uuid AND is_active AND account_type='expense') THEN RAISE EXCEPTION 'active gain and loss accounts required'; END IF;
  SELECT account_id INTO v_asset FROM public.journal_lines WHERE id=v_s.source_line_id;
  IF (p_payload->>'proceeds_account_id')::uuid IN (v_asset,(v_s.terms->>'accumulated_account_id')::uuid) THEN RAISE EXCEPTION 'proceeds account must differ from asset and accumulated depreciation'; END IF;
 END IF;
 RETURN p_payload;
END; $$;

CREATE OR REPLACE FUNCTION public.post_schedule_expense(p_s public.finance_schedules,p_request uuid,p_date date)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_amount numeric(15,2):=public.schedule_earned(p_s,p_date)-public.schedule_expensed(p_s.id,p_date);v_asset uuid;v_journal uuid;v_lines jsonb;
BEGIN
 IF v_amount<=0 THEN RETURN NULL; END IF;
 IF p_s.kind='FIXED_ASSET' THEN v_asset:=(p_s.terms->>'accumulated_account_id')::uuid;ELSE SELECT account_id INTO v_asset FROM public.journal_lines WHERE id=p_s.source_line_id; END IF;
 v_lines:=jsonb_build_array(jsonb_build_object('account_id',p_s.terms->>'expense_account_id','debit',v_amount::text,'credit','0.00'),jsonb_build_object('account_id',v_asset,'debit','0.00','credit',v_amount::text));
 v_journal:=public.post_manual_journal(p_s.entity_id,'SCHEDULE-'||p_request,p_date,'Scheduled expense: '||p_s.reference,v_lines,'finance:'||p_request||':expense');
 INSERT INTO public.finance_schedule_entries(org_id,schedule_id,slot,kind,as_of,amount,journal_id,request_id,details)
  VALUES(p_s.org_id,p_s.id,'expense:'||p_request,'EXPENSE',p_date,v_amount,v_journal,p_request,jsonb_build_object('lines',v_lines));
 RETURN v_journal;
END; $$;

CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p jsonb:=p_request.payload;v_s public.finance_schedules%ROWTYPE;v_e public.finance_schedule_entries%ROWTYPE;
 v_id uuid;v_journal uuid;v_date date;v_amount numeric(15,2);v_expensed numeric(15,2);v_proceeds numeric(15,2);v_loss numeric(15,2);v_asset uuid;v_lines jsonb;v_journals jsonb:='[]';v_entry_kind text;
BEGIN
 IF p_request.kind='SCHEDULE_CREATE' THEN
  IF v_p->>'kind' IN ('PREPAID','FIXED_ASSET') THEN SELECT debit-credit INTO v_amount FROM public.journal_lines WHERE id=(v_p->>'source_line_id')::uuid; END IF;
  INSERT INTO public.finance_schedules(org_id,entity_id,reference,kind,currency,terms,cost,source_line_id,creation_request)
   SELECT p_request.org_id,p_request.entity_id,v_p->>'reference',v_p->>'kind',currency,v_p,v_amount,(v_p->>'source_line_id')::uuid,p_request.id FROM public.entities WHERE id=p_request.entity_id RETURNING id INTO v_id;
  RETURN jsonb_build_object('scheduleId',v_id);
 ELSIF p_request.kind NOT IN ('SCHEDULE_RUN','SCHEDULE_CANCEL','SCHEDULE_CORRECT','ASSET_DISPOSE','ASSET_RESTORE') THEN RETURN public.execute_integration_extension(p_request); END IF;
 SELECT * INTO v_s FROM public.finance_schedules WHERE id=(v_p->>'schedule_id')::uuid AND org_id=p_request.org_id;
 IF p_request.kind='SCHEDULE_CANCEL' THEN UPDATE public.finance_schedules SET state='CANCELLED',cancel_request=p_request.id WHERE id=v_s.id;RETURN jsonb_build_object('cancelled',v_s.id);END IF;
 v_date:=(v_p->>'date')::date;
 IF p_request.kind IN ('SCHEDULE_CORRECT','ASSET_RESTORE') THEN
  SELECT * INTO v_e FROM public.finance_schedule_entries WHERE schedule_id=v_s.id AND reversal_journal IS NULL AND CASE WHEN p_request.kind='ASSET_RESTORE' THEN kind='DISPOSAL' ELSE id=(v_p->>'entry_id')::uuid END;
  v_journal:=public.reverse_posted_journal(v_e.journal_id,v_date,left(p_request.reason,240),'finance:'||p_request.id);
  UPDATE public.finance_schedule_entries SET reversal_journal=v_journal,reversal_date=v_date,reversal_request=p_request.id WHERE id=v_e.id;
  IF p_request.kind='ASSET_RESTORE' THEN UPDATE public.finance_schedules SET state='ACTIVE' WHERE id=v_s.id; END IF;
  RETURN jsonb_build_object('reversalId',v_journal);
 END IF;
 IF v_s.kind IN ('PREPAID','FIXED_ASSET') THEN
  v_journal:=public.post_schedule_expense(v_s,p_request.id,v_date);IF v_journal IS NOT NULL THEN v_journals:=jsonb_build_array(v_journal); END IF;
 ELSE
  FOR v_date IN SELECT * FROM public.schedule_pending_dates(v_s,(v_p->>'date')::date) ORDER BY 1 LOOP
   v_lines:=v_s.terms->'lines';v_entry_kind:=v_s.kind;
   IF v_s.kind='ACCRUAL' AND v_date=(v_s.terms->>'ends_on')::date THEN
    SELECT journal_id INTO v_id FROM public.finance_schedule_entries WHERE schedule_id=v_s.id AND kind='ACCRUAL';
    IF v_id IS NULL THEN RAISE EXCEPTION 'original accrual must post before its reversal'; END IF;
    v_journal:=public.reverse_posted_journal(v_id,v_date,'Scheduled accrual reversal: '||v_s.reference,'finance:'||p_request.id||':'||v_date);v_entry_kind:='REVERSAL';
    SELECT jsonb_agg(jsonb_build_object('account_id',value->>'account_id','debit',value->'credit','credit',value->'debit') ORDER BY ordinal) INTO v_lines FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS line(value,ordinal);
   ELSE v_journal:=public.post_manual_journal(v_s.entity_id,'SCHEDULE-'||v_s.id||'-'||v_date,v_date,'Recurring finance: '||v_s.reference,v_lines,'finance:'||p_request.id||':'||v_date); END IF;
   INSERT INTO public.finance_schedule_entries(org_id,schedule_id,slot,kind,as_of,journal_id,request_id,details) VALUES(v_s.org_id,v_s.id,'date:'||v_date,v_entry_kind,v_date,v_journal,p_request.id,jsonb_build_object('lines',v_lines));
   v_journals:=v_journals||to_jsonb(v_journal::text);
  END LOOP;
 END IF;
 IF p_request.kind='ASSET_DISPOSE' THEN
  v_date:=(v_p->>'date')::date;v_expensed:=public.schedule_expensed(v_s.id,v_date);v_proceeds:=public.cash_amount(v_p->>'proceeds');v_loss:=v_s.cost-v_expensed-v_proceeds;
  SELECT account_id INTO v_asset FROM public.journal_lines WHERE id=v_s.source_line_id;
  v_lines:='[]';
  IF v_proceeds>0 THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',v_p->>'proceeds_account_id','debit',v_proceeds::text,'credit','0.00')); END IF;
  IF v_s.kind='FIXED_ASSET' AND v_expensed>0 THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',v_s.terms->>'accumulated_account_id','debit',v_expensed::text,'credit','0.00')); END IF;
  v_amount:=CASE WHEN v_s.kind='FIXED_ASSET' THEN v_s.cost ELSE v_s.cost-v_expensed END;
  IF v_amount>0 THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',v_asset,'debit','0.00','credit',v_amount::text)); END IF;
  IF v_loss<>0 THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',CASE WHEN v_loss>0 THEN v_p->>'loss_account_id' ELSE v_p->>'gain_account_id' END,'debit',greatest(v_loss,0)::text,'credit',greatest(-v_loss,0)::text)); END IF;
  IF jsonb_array_length(v_lines)<2 THEN RAISE EXCEPTION 'fully amortized prepaid has no remaining disposal transaction'; END IF;
  v_journal:=public.post_manual_journal(v_s.entity_id,'DISPOSAL-'||p_request.id,v_date,'Asset disposal: '||v_s.reference,v_lines,'finance:'||p_request.id||':disposal');
  INSERT INTO public.finance_schedule_entries(org_id,schedule_id,slot,kind,as_of,amount,journal_id,request_id,details) VALUES(v_s.org_id,v_s.id,'disposal:'||p_request.id,'DISPOSAL',v_date,v_s.cost-v_expensed,v_journal,p_request.id,jsonb_build_object('lines',v_lines,'proceeds',v_proceeds::text,'gainLoss',v_loss::text,'expensed',v_expensed::text));
  UPDATE public.finance_schedules SET state='DISPOSED' WHERE id=v_s.id;v_journals:=v_journals||to_jsonb(v_journal::text);
 END IF;
 RETURN jsonb_build_object('journals',v_journals);
END; $$;

CREATE OR REPLACE FUNCTION public.finance_source_snapshot(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_s public.finance_schedules%ROWTYPE;v_source jsonb;v_entries jsonb;
BEGIN
 IF p_kind='SCHEDULE_CREATE' AND p_payload->>'kind' IN ('PREPAID','FIXED_ASSET') THEN
  SELECT jsonb_build_object('journal',j.id,'number',j.entry_number,'date',j.entry_date,'asset_account',l.account_id,'cost',(l.debit-l.credit)::text,'reversed',j.reversed_by_id) INTO v_source FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE l.id=(p_payload->>'source_line_id')::uuid AND j.entity_id=p_entity AND j.org_id=public.get_user_org_id();RETURN v_source;
 ELSIF p_kind NOT IN ('SCHEDULE_RUN','SCHEDULE_CANCEL','SCHEDULE_CORRECT','ASSET_DISPOSE','ASSET_RESTORE') THEN RETURN public.integration_source_snapshot(p_entity,p_kind,p_payload); END IF;
 SELECT * INTO v_s FROM public.finance_schedules WHERE id=(p_payload->>'schedule_id')::uuid AND entity_id=p_entity AND org_id=public.get_user_org_id();
 IF v_s.id IS NULL THEN RAISE EXCEPTION 'schedule source unavailable'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'date',as_of,'amount',amount::text,'journal',journal_id,'reversed',reversal_journal,'reversal_date',reversal_date) ORDER BY as_of,id),'[]') INTO v_entries FROM public.finance_schedule_entries WHERE schedule_id=v_s.id;
 RETURN jsonb_build_object('reference',v_s.reference,'kind',v_s.kind,'state',v_s.state,'terms',v_s.terms,'cost',v_s.cost::text,'entries',v_entries,
  'earned_through_date',CASE WHEN v_s.kind IN ('PREPAID','FIXED_ASSET') AND p_payload ? 'date' THEN public.schedule_earned(v_s,(p_payload->>'date')::date)::text END);
END; $$;

-- Shared exact journal validation also supports subsequent group/close source graphs.
CREATE OR REPLACE FUNCTION public.assert_finance_journal(p_id uuid,p_org uuid,p_entity uuid,p_date date,p_lines jsonb,p_reversed_by uuid DEFAULT NULL,p_reversal_of uuid DEFAULT NULL)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_actual jsonb;v_expected jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.journal_entries j JOIN public.accounting_events e ON e.id=j.accounting_event_id AND e.journal_entry_id=j.id AND e.entity_id=j.entity_id AND e.org_id=j.org_id
  WHERE j.id=p_id AND j.org_id=p_org AND j.entity_id=p_entity AND j.entry_date=p_date AND j.status='posted' AND j.source_module='gl' AND j.reversed_by_id IS NOT DISTINCT FROM p_reversed_by AND j.reversal_of_id IS NOT DISTINCT FROM p_reversal_of) THEN RAISE EXCEPTION 'finance journal lineage is invalid'; END IF;
 IF EXISTS(SELECT 1 FROM public.journal_lines l JOIN public.accounts a ON a.id=l.account_id WHERE l.journal_entry_id=p_id AND a.org_id<>p_org) THEN RAISE EXCEPTION 'finance journal account ownership is invalid'; END IF;
 SELECT jsonb_agg(jsonb_build_array(account_id,debit::numeric,credit::numeric) ORDER BY account_id,debit,credit) INTO v_actual FROM public.journal_lines WHERE journal_entry_id=p_id;
 SELECT jsonb_agg(jsonb_build_array((value->>'account_id')::uuid,(value->>'debit')::numeric,(value->>'credit')::numeric) ORDER BY (value->>'account_id')::uuid,(value->>'debit')::numeric,(value->>'credit')::numeric) INTO v_expected FROM jsonb_array_elements(p_lines);
 IF v_actual IS NULL OR v_actual IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'finance journal amount or account mismatch'; END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.flip_finance_lines(p_lines jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_agg(jsonb_build_object('account_id',value->>'account_id','debit',value->'credit','credit',value->'debit') ORDER BY ordinal) FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS line(value,ordinal)
$$;

CREATE OR REPLACE FUNCTION public.guard_schedule_journal_reversal()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_s uuid;v_r public.finance_requests%ROWTYPE;
BEGIN
 IF NEW.reversal_of_id IS NULL THEN RETURN NEW; END IF;
 IF EXISTS(SELECT 1 FROM public.finance_schedules s JOIN public.journal_lines l ON l.id=s.source_line_id WHERE l.journal_entry_id=NEW.reversal_of_id AND s.state<>'CANCELLED') THEN RAISE EXCEPTION 'registered acquisition journals require an asset cancellation or disposal workflow'; END IF;
 SELECT schedule_id INTO v_s FROM public.finance_schedule_entries WHERE journal_id=NEW.reversal_of_id;
 IF v_s IS NULL THEN RETURN NEW; END IF;
 SELECT * INTO v_r FROM public.finance_requests WHERE id=nullif(current_setting('tapaano.finance_request',true),'')::uuid AND state='EXECUTING' AND org_id=NEW.org_id AND entity_id=NEW.entity_id AND decided_by=auth.uid() AND requested_by<>auth.uid() AND payload->>'schedule_id'=v_s::text;
 IF v_r.id IS NULL OR v_r.kind NOT IN ('SCHEDULE_RUN','SCHEDULE_CORRECT','ASSET_RESTORE') THEN RAISE EXCEPTION 'schedule journals require a linked independent correction'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS schedule_journal_reversal ON public.journal_entries;
CREATE TRIGGER schedule_journal_reversal BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_schedule_journal_reversal();

CREATE OR REPLACE FUNCTION public.validate_schedule_graph(p_schedule uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_s public.finance_schedules%ROWTYPE;v_e public.finance_schedule_entries%ROWTYPE;v_r public.finance_requests%ROWTYPE;v_c public.finance_requests%ROWTYPE;
 v_lines jsonb;v_asset uuid;v_acquisition record;v_amount numeric;v_prior numeric;v_reversed uuid;v_original uuid;v_proceeds numeric;v_expensed numeric;v_loss numeric;v_months integer;
BEGIN
 SELECT * INTO v_s FROM public.finance_schedules WHERE id=p_schedule;
 IF v_s.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_s.creation_request AND org_id=v_s.org_id AND entity_id=v_s.entity_id AND state IN ('APPROVED','EXECUTING') AND kind='SCHEDULE_CREATE' AND payload=v_s.terms) THEN RAISE EXCEPTION 'schedule approval lineage mismatch'; END IF;
 IF v_s.state='CANCELLED' THEN
  IF NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_s.cancel_request AND kind='SCHEDULE_CANCEL' AND state IN ('APPROVED','EXECUTING') AND payload->>'schedule_id'=v_s.id::text) THEN RAISE EXCEPTION 'schedule cancellation lineage mismatch'; END IF;
 ELSIF v_s.cancel_request IS NOT NULL THEN RAISE EXCEPTION 'schedule cancellation state mismatch'; END IF;
 IF (v_s.state='DISPOSED') IS DISTINCT FROM EXISTS(SELECT 1 FROM public.finance_schedule_entries WHERE schedule_id=v_s.id AND kind='DISPOSAL' AND reversal_journal IS NULL) THEN RAISE EXCEPTION 'asset disposal state mismatch'; END IF;
 IF v_s.kind IN ('PREPAID','FIXED_ASSET') THEN
  SELECT l.account_id,l.debit-l.credit AS amount,j.org_id,j.entity_id,j.reversed_by_id,j.entry_date INTO v_acquisition FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id
   JOIN public.accounting_events ev ON ev.id=j.accounting_event_id AND ev.journal_entry_id=j.id AND ev.org_id=j.org_id AND ev.entity_id=j.entity_id
   JOIN public.accounting_periods p ON p.id=j.accounting_period_id AND p.org_id=j.org_id AND p.entity_id=j.entity_id AND j.entry_date BETWEEN p.period_start AND p.period_end
   WHERE l.id=v_s.source_line_id AND j.status='posted';
  IF v_acquisition.account_id IS NULL OR v_acquisition.org_id<>v_s.org_id OR v_acquisition.entity_id<>v_s.entity_id OR v_acquisition.amount IS DISTINCT FROM v_s.cost OR (v_acquisition.reversed_by_id IS NOT NULL AND v_s.state<>'CANCELLED') THEN RAISE EXCEPTION 'asset acquisition lineage mismatch'; END IF;
  v_asset:=v_acquisition.account_id;
 END IF;
 FOR v_e IN SELECT * FROM public.finance_schedule_entries WHERE schedule_id=v_s.id ORDER BY as_of,id LOOP
  SELECT * INTO v_r FROM public.finance_requests WHERE id=v_e.request_id AND org_id=v_s.org_id AND entity_id=v_s.entity_id AND state IN ('APPROVED','EXECUTING') AND payload->>'schedule_id'=v_s.id::text;
  IF v_r.id IS NULL OR v_e.org_id<>v_s.org_id THEN RAISE EXCEPTION 'schedule posting approval mismatch'; END IF;
  v_reversed:=v_e.reversal_journal;v_original:=NULL;
  IF v_e.kind='EXPENSE' THEN
   IF v_s.kind NOT IN ('PREPAID','FIXED_ASSET') OR v_r.kind NOT IN ('SCHEDULE_RUN','ASSET_DISPOSE') THEN RAISE EXCEPTION 'scheduled expense source mismatch'; END IF;
   SELECT coalesce(sum(CASE WHEN value->>'kind'='EXPENSE' AND (value->>'date')::date<=v_e.as_of THEN (value->>'amount')::numeric-CASE WHEN (value->>'reversal_date')::date<=v_e.as_of THEN (value->>'amount')::numeric ELSE 0 END ELSE 0 END),0) INTO v_prior FROM jsonb_array_elements(v_r.source_snapshot->'entries');
   v_amount:=public.schedule_earned(v_s,v_e.as_of)-v_prior;
   IF v_e.amount IS DISTINCT FROM v_amount OR v_amount<=0 OR (v_r.payload->>'date')::date<>v_e.as_of THEN RAISE EXCEPTION 'scheduled expense exceeds its approved source amount'; END IF;
   v_lines:=jsonb_build_array(jsonb_build_object('account_id',v_s.terms->>'expense_account_id','debit',v_amount::text,'credit','0.00'),jsonb_build_object('account_id',CASE WHEN v_s.kind='FIXED_ASSET' THEN v_s.terms->>'accumulated_account_id' ELSE v_asset::text END,'debit','0.00','credit',v_amount::text));
  ELSIF v_e.kind='DISPOSAL' THEN
   IF v_r.kind<>'ASSET_DISPOSE' OR (v_r.payload->>'date')::date<>v_e.as_of THEN RAISE EXCEPTION 'disposal source mismatch'; END IF;
   v_proceeds:=public.cash_amount(v_r.payload->>'proceeds');v_expensed:=public.schedule_earned(v_s,v_e.as_of);v_loss:=v_s.cost-v_expensed-v_proceeds;v_lines:='[]';
   IF v_proceeds>0 THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',v_r.payload->>'proceeds_account_id','debit',v_proceeds::text,'credit','0.00')); END IF;
   IF v_s.kind='FIXED_ASSET' AND v_expensed>0 THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',v_s.terms->>'accumulated_account_id','debit',v_expensed::text,'credit','0.00')); END IF;
   v_amount:=CASE WHEN v_s.kind='FIXED_ASSET' THEN v_s.cost ELSE v_s.cost-v_expensed END;
   IF v_amount>0 THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',v_asset,'debit','0.00','credit',v_amount::text)); END IF;
   IF v_loss<>0 THEN v_lines:=v_lines||jsonb_build_array(jsonb_build_object('account_id',CASE WHEN v_loss>0 THEN v_r.payload->>'loss_account_id' ELSE v_r.payload->>'gain_account_id' END,'debit',greatest(v_loss,0)::text,'credit',greatest(-v_loss,0)::text)); END IF;
   IF v_e.amount IS DISTINCT FROM v_s.cost-v_expensed THEN RAISE EXCEPTION 'disposal carrying value mismatch'; END IF;
  ELSE
   IF v_s.kind NOT IN ('RECURRING','ACCRUAL') OR v_r.kind<>'SCHEDULE_RUN' OR v_e.as_of>(v_r.payload->>'date')::date THEN RAISE EXCEPTION 'recurring source mismatch'; END IF;
   IF v_e.slot IS DISTINCT FROM 'date:'||v_e.as_of OR v_e.amount<>0 OR v_e.as_of<(v_s.terms->>'starts_on')::date OR v_e.as_of>(v_s.terms->>'ends_on')::date THEN RAISE EXCEPTION 'recurring occurrence lineage mismatch'; END IF;
   IF v_s.kind='RECURRING' THEN
    v_months:=(extract(year FROM v_e.as_of)-extract(year FROM (v_s.terms->>'starts_on')::date))::int*12+(extract(month FROM v_e.as_of)-extract(month FROM (v_s.terms->>'starts_on')::date))::int;
    IF v_e.kind<>'RECURRING' OR v_months%(v_s.terms->>'cycle_months')::int<>0 OR v_e.as_of<>((v_s.terms->>'starts_on')::date+make_interval(months=>v_months))::date THEN RAISE EXCEPTION 'recurring occurrence is outside its approved calendar'; END IF;
   ELSIF v_e.kind NOT IN ('ACCRUAL','REVERSAL') OR (v_e.kind='ACCRUAL' AND v_e.as_of<>(v_s.terms->>'starts_on')::date) THEN RAISE EXCEPTION 'accrual occurrence mismatch'; END IF;
   v_lines:=v_s.terms->'lines';
   IF v_e.kind='REVERSAL' THEN
    SELECT journal_id INTO v_original FROM public.finance_schedule_entries WHERE schedule_id=v_s.id AND kind='ACCRUAL';v_lines:=public.flip_finance_lines(v_lines);
    IF v_original IS NULL OR v_e.as_of<>(v_s.terms->>'ends_on')::date THEN RAISE EXCEPTION 'accrual reversal lineage mismatch'; END IF;
   ELSIF v_e.kind='ACCRUAL' THEN SELECT journal_id INTO v_reversed FROM public.finance_schedule_entries WHERE schedule_id=v_s.id AND kind='REVERSAL'; END IF;
  END IF;
  PERFORM public.assert_finance_journal(v_e.journal_id,v_s.org_id,v_s.entity_id,v_e.as_of,v_lines,v_reversed,v_original);
  IF v_e.reversal_journal IS NOT NULL THEN
   SELECT * INTO v_c FROM public.finance_requests WHERE id=v_e.reversal_request AND org_id=v_s.org_id AND entity_id=v_s.entity_id AND state IN ('APPROVED','EXECUTING') AND payload->>'schedule_id'=v_s.id::text;
   IF v_c.id IS NULL OR (v_c.payload->>'date')::date<>v_e.reversal_date OR (v_e.kind='DISPOSAL' AND v_c.kind<>'ASSET_RESTORE') OR (v_e.kind<>'DISPOSAL' AND (v_c.kind<>'SCHEDULE_CORRECT' OR v_c.payload->>'entry_id'<>v_e.id::text)) THEN RAISE EXCEPTION 'schedule correction approval mismatch'; END IF;
   PERFORM public.assert_finance_journal(v_e.reversal_journal,v_s.org_id,v_s.entity_id,v_e.reversal_date,public.flip_finance_lines(v_lines),NULL,v_e.journal_id);
  END IF;
 END LOOP;
END; $$;

CREATE OR REPLACE FUNCTION public.check_schedule_graph_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='finance_schedules' THEN PERFORM public.validate_schedule_graph(NEW.id);ELSE PERFORM public.validate_schedule_graph(NEW.schedule_id);END IF;RETURN NULL;
END; $$;

CREATE OR REPLACE FUNCTION public.get_schedule_acquisitions(p_entity uuid,p_search text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_rows jsonb;v_org uuid:=public.get_user_org_id();v_more boolean;
BEGIN
 IF auth.uid() IS NULL OR length(coalesce(p_search,''))>100 OR NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity AND org_id=v_org) THEN RAISE EXCEPTION 'acquisition search unavailable'; END IF;
 WITH candidates AS (
  SELECT l.id,l.account_id,a.code,a.name,j.entry_number,j.entry_date,round(l.debit-l.credit,2)::text AS cost
  FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id JOIN public.accounts a ON a.id=l.account_id
  WHERE j.entity_id=p_entity AND j.org_id=v_org AND j.status='posted' AND j.reversed_by_id IS NULL AND j.reversal_of_id IS NULL AND a.is_active AND a.account_type='asset' AND l.debit>0 AND l.credit=0
   AND position(lower(coalesce(p_search,'')) IN lower(a.code||' '||a.name||' '||j.entry_number))>0
   AND NOT EXISTS(SELECT 1 FROM public.finance_schedules WHERE source_line_id=l.id AND state<>'CANCELLED')
   AND NOT EXISTS(SELECT 1 FROM public.finance_schedule_entries WHERE journal_id=j.id OR reversal_journal=j.id)
   AND NOT EXISTS(SELECT 1 FROM public.cash_registers WHERE entity_id=p_entity AND account_id=l.account_id)
   AND NOT EXISTS(SELECT 1 FROM public.entity_customer_receipt_controls WHERE entity_id=p_entity AND l.account_id IN (cash_account_id,ar_account_id))
   AND NOT EXISTS(SELECT 1 FROM public.finance_connections WHERE entity_id=p_entity AND clearing_account_id=l.account_id)
   AND NOT EXISTS(SELECT 1 FROM public.finance_contracts WHERE entity_id=p_entity AND terms->>'unbilled_account_id'=l.account_id::text)
  ORDER BY j.entry_date DESC,l.id LIMIT 201
 ), numbered AS (SELECT *,row_number() OVER(ORDER BY entry_date DESC,id) AS n FROM candidates)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'accountId',account_id,'code',code,'name',name,'journal',entry_number,'date',entry_date,'cost',cost) ORDER BY entry_date DESC,id) FILTER(WHERE n<=200),'[]'),count(*)>200 INTO v_rows,v_more FROM numbered;
 RETURN jsonb_build_object('rows',v_rows,'hasMore',v_more);
END; $$;

CREATE OR REPLACE FUNCTION public.get_asset_schedule_controls(p_entity uuid,p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_id uuid;v_result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity AND org_id=public.get_user_org_id()) THEN RAISE EXCEPTION 'asset controls unavailable'; END IF;
 FOR v_id IN SELECT id FROM public.finance_schedules WHERE entity_id=p_entity AND kind IN ('PREPAID','FIXED_ASSET') LOOP PERFORM public.validate_schedule_graph(v_id);END LOOP;
 WITH sources AS (
  SELECT s.*,l.account_id AS asset_account,CASE WHEN j.entry_date<=p_as_of AND s.state<>'CANCELLED' THEN s.cost ELSE 0 END AS dated_cost,
   public.schedule_expensed(s.id,p_as_of) AS expensed,
   (SELECT coalesce(sum(CASE WHEN e.as_of<=p_as_of THEN 1 ELSE 0 END-CASE WHEN e.reversal_date<=p_as_of THEN 1 ELSE 0 END),0) FROM public.finance_schedule_entries e WHERE e.schedule_id=s.id AND e.kind='DISPOSAL') AS disposed,
   (SELECT coalesce(sum((CASE WHEN e.as_of<=p_as_of THEN 1 ELSE 0 END-CASE WHEN e.reversal_date<=p_as_of THEN 1 ELSE 0 END)*(e.details->>'expensed')::numeric),0) FROM public.finance_schedule_entries e WHERE e.schedule_id=s.id AND e.kind='DISPOSAL') AS disposed_expense
  FROM public.finance_schedules s JOIN public.journal_lines l ON l.id=s.source_line_id JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE s.entity_id=p_entity AND s.kind IN ('PREPAID','FIXED_ASSET')
 ), expectations AS (
  SELECT asset_account AS account_id,dated_cost-CASE WHEN kind='PREPAID' THEN expensed+disposed*cost-disposed_expense ELSE disposed*cost END AS amount FROM sources
  UNION ALL SELECT (terms->>'accumulated_account_id')::uuid,-expensed+disposed_expense FROM sources WHERE kind='FIXED_ASSET'
 ), expected AS (SELECT account_id,sum(amount) AS amount FROM expectations GROUP BY account_id),compared AS (
  SELECT x.account_id,x.amount,(SELECT coalesce(sum(l.debit-l.credit),0) FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.entity_id=p_entity AND j.status='posted' AND j.entry_date<=p_as_of AND l.account_id=x.account_id) AS ledger FROM expected x
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('accountId',c.account_id,'expected',round(c.amount,2)::text,'ledger',round(c.ledger,2)::text,'variance',round(c.ledger-c.amount,2)::text) ORDER BY c.account_id),'[]') INTO v_result FROM compared c;
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.get_finance_schedule(p_schedule uuid,p_as_of date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_s public.finance_schedules%ROWTYPE;v_entries jsonb;v_projection jsonb;v_expensed numeric(15,2);v_cost numeric(15,2);v_disposed boolean;v_asset uuid;v_account uuid;v_controls jsonb;
BEGIN
 SELECT * INTO v_s FROM public.finance_schedules WHERE id=p_schedule AND org_id=public.get_user_org_id();
 IF auth.uid() IS NULL OR v_s.id IS NULL OR p_as_of IS NULL THEN RAISE EXCEPTION 'schedule report unavailable'; END IF;
 PERFORM public.validate_schedule_graph(v_s.id);PERFORM public.get_entity_trial_balance(v_s.entity_id,DATE '0001-01-01',p_as_of);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'kind',kind,'date',as_of,'amount',amount::text,'journalId',journal_id,'reversedOn',reversal_date,'reversalId',reversal_journal,'details',details) ORDER BY as_of,id),'[]') INTO v_entries FROM public.finance_schedule_entries WHERE schedule_id=v_s.id;
 IF v_s.kind IN ('PREPAID','FIXED_ASSET') THEN
  v_expensed:=public.schedule_expensed(v_s.id,p_as_of);
  SELECT CASE WHEN j.entry_date<=p_as_of AND v_s.state<>'CANCELLED' THEN v_s.cost ELSE 0 END,l.account_id INTO v_cost,v_asset FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE l.id=v_s.source_line_id;
  SELECT EXISTS(SELECT 1 FROM public.finance_schedule_entries WHERE schedule_id=v_s.id AND kind='DISPOSAL' AND as_of<=p_as_of AND (reversal_date IS NULL OR reversal_date>p_as_of)) INTO v_disposed;
  SELECT coalesce(jsonb_agg(jsonb_build_object('date',day,'cumulativeExpense',public.schedule_earned(v_s,day)::numeric(15,2)::text) ORDER BY day),'[]') INTO v_projection FROM (SELECT DISTINCT least((date_trunc('month',month)+interval '1 month - 1 day')::date,(v_s.terms->>'ends_on')::date) AS day FROM generate_series(date_trunc('month',(v_s.terms->>'starts_on')::date),date_trunc('month',(v_s.terms->>'ends_on')::date),interval '1 month') AS month) dates;
 ELSE SELECT coalesce(jsonb_agg(day ORDER BY day),'[]') INTO v_projection FROM public.schedule_pending_dates(v_s,(v_s.terms->>'ends_on')::date) day; END IF;
 RETURN jsonb_build_object('id',v_s.id,'entityId',v_s.entity_id,'reference',v_s.reference,'kind',v_s.kind,'currency',v_s.currency,'state',v_s.state,'asOf',p_as_of,'terms',v_s.terms,
  'cost',v_cost::text,'expensed',v_expensed::text,'carryingValue',CASE WHEN v_disposed THEN '0.00' ELSE (v_cost-v_expensed)::numeric(15,2)::text END,'disposedAsOf',coalesce(v_disposed,false),'entries',v_entries,'projection',v_projection,'controls',public.get_asset_schedule_controls(v_s.entity_id,p_as_of));
END; $$;

DO $$ DECLARE t text;f record; BEGIN
 FOREACH t IN ARRAY ARRAY['finance_schedules','finance_schedule_entries'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(org_id=public.get_user_org_id())',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);
  EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);
  EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS schedule_graph ON public.%I',t);
  EXECUTE format('CREATE CONSTRAINT TRIGGER schedule_graph AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_schedule_graph_trigger()',t);
 END LOOP;
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
  ('schedule_earned','schedule_expensed','schedule_pending_dates','post_schedule_expense','assert_finance_journal','flip_finance_lines','guard_schedule_journal_reversal','validate_schedule_graph','check_schedule_graph_trigger','get_finance_schedule','get_schedule_acquisitions','get_asset_schedule_controls','validate_integration_extension','execute_integration_extension','integration_source_snapshot','validate_finance_extension','execute_finance_extension','finance_source_snapshot') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname IN ('get_finance_schedule','get_schedule_acquisitions') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END; $$;
COMMIT;
