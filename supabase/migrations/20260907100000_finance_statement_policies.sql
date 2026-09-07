BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.validate_group_extension(uuid,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.validate_finance_extension(uuid,text,jsonb) RENAME TO validate_group_extension;
  ALTER FUNCTION public.execute_finance_extension(public.finance_requests) RENAME TO execute_group_extension;
  ALTER FUNCTION public.finance_source_snapshot(uuid,text,jsonb) RENAME TO group_source_snapshot;
 END IF;
END; $$;

CREATE TABLE IF NOT EXISTS public.finance_statement_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,group_id uuid,
 version integer NOT NULL CHECK(version>0),mappings jsonb NOT NULL,cash_accounts uuid[] NOT NULL,request_id uuid NOT NULL,
 UNIQUE(org_id,id),UNIQUE(request_id),FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,group_id) REFERENCES public.finance_groups(org_id,id),FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS finance_entity_statement_version ON public.finance_statement_policies(entity_id,version) WHERE group_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS finance_group_statement_version ON public.finance_statement_policies(group_id,version) WHERE group_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS public.finance_cash_classifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,entity_id uuid NOT NULL,line_id uuid NOT NULL REFERENCES public.journal_lines(id),
 version integer NOT NULL CHECK(version>0),policy_id uuid NOT NULL,allocations jsonb NOT NULL,request_id uuid NOT NULL,
 UNIQUE(org_id,id),UNIQUE(line_id,version),FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,policy_id) REFERENCES public.finance_statement_policies(org_id,id),FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id)
);
CREATE INDEX IF NOT EXISTS finance_cash_classification_current ON public.finance_cash_classifications(entity_id,line_id,version DESC);

CREATE OR REPLACE FUNCTION public.finance_statement_sections()
RETURNS TABLE(section text,label text,account_type text,basis text,sign integer,sort integer)
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$ VALUES
 ('CASH','Cash and cash equivalents','asset','closing',1,10),
 ('RESTRICTED_CASH_CURRENT','Current restricted cash','asset','closing',1,11),
 ('RESTRICTED_CASH_NONCURRENT','Noncurrent restricted cash','asset','closing',1,12),
 ('TRADE_RECEIVABLES','Trade receivables','asset','closing',1,20),
 ('OTHER_CURRENT_ASSETS','Other current assets','asset','closing',1,30),
 ('NONCURRENT_ASSETS','Noncurrent assets','asset','closing',1,40),
 ('CURRENT_LIABILITIES','Current liabilities','liability','closing',-1,50),
 ('NONCURRENT_LIABILITIES','Noncurrent liabilities','liability','closing',-1,60),
 ('CAPITAL','Contributed capital','equity','closing',-1,70),
 ('RETAINED_EARNINGS','Recorded retained earnings','equity','closing',-1,80),
 ('OTHER_EQUITY','Other equity','equity','closing',-1,90),
 ('REVENUE','Revenue','revenue','income',-1,100),
 ('COST_OF_REVENUE','Cost of revenue','expense','income',1,110),
 ('OPERATING_EXPENSES','Operating expenses','expense','income',1,120),
 ('OTHER_INCOME','Other income','revenue','income',-1,130),
 ('OTHER_EXPENSES','Other expenses','expense','income',1,140),
 ('INCOME_TAX','Income tax expense','expense','income',1,150)
$$;
CREATE OR REPLACE FUNCTION public.finance_cash_categories()
RETURNS TABLE(category text,label text,section text,sort integer)
LANGUAGE sql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$ VALUES
 ('CUSTOMER_RECEIPTS','Customer receipts and refunds','OPERATING',10),
 ('SUPPLIER_EMPLOYEE_PAYMENTS','Supplier and employee payments','OPERATING',20),
 ('OTHER_OPERATING','Other operating cash','OPERATING',30),
 ('INTEREST','Interest paid and received','OPERATING',40),
 ('INCOME_TAXES','Income taxes paid and refunded','OPERATING',50),
 ('CAPITAL_EXPENDITURES','Capital expenditure','INVESTING',60),
 ('ASSET_DISPOSALS','Asset disposal proceeds','INVESTING',70),
 ('INVESTMENTS_LOANS','Investments and loans','INVESTING',80),
 ('OTHER_INVESTING','Other investing cash','INVESTING',90),
 ('BORROWINGS','Borrowings and repayments','FINANCING',100),
 ('EQUITY','Equity proceeds and repurchases','FINANCING',110),
 ('DIVIDENDS','Dividends','FINANCING',120),
 ('OTHER_FINANCING','Other financing cash','FINANCING',130),
 ('TRANSFER','Internal cash transfers and clearing offsets','TRANSFER',140)
$$;
CREATE OR REPLACE FUNCTION public.latest_statement_policy(p_entity uuid,p_group uuid DEFAULT NULL)
RETURNS public.finance_statement_policies LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT p FROM public.finance_statement_policies p WHERE entity_id=p_entity AND group_id IS NOT DISTINCT FROM p_group AND org_id=public.get_user_org_id() ORDER BY version DESC LIMIT 1
$$;
CREATE OR REPLACE FUNCTION public.validate_cash_allocations(p_allocations jsonb,p_amount numeric)
RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_item jsonb;v_sum numeric:=0;v_seen text[]:='{}';v_amount numeric;
BEGIN
 IF jsonb_typeof(p_allocations) IS DISTINCT FROM 'array' OR jsonb_array_length(p_allocations) NOT BETWEEN 1 AND 14 OR p_amount=0 THEN RAISE EXCEPTION 'cash allocations require a nonzero source and one to 14 categories'; END IF;
 FOR v_item IN SELECT value FROM jsonb_array_elements(p_allocations) LOOP
  IF v_item-ARRAY['category','amount']<>'{}'::jsonb OR jsonb_typeof(v_item->'amount') IS DISTINCT FROM 'string' OR NOT EXISTS(SELECT 1 FROM public.finance_cash_categories() WHERE category=v_item->>'category') OR v_item->>'category'=ANY(v_seen) THEN RAISE EXCEPTION 'cash allocation categories must be valid and unique with exact amounts'; END IF;
  v_amount:=public.cash_amount(v_item->>'amount');IF v_amount<=0 THEN RAISE EXCEPTION 'allocation magnitudes must be positive'; END IF;
  v_sum:=v_sum+v_amount;v_seen:=array_append(v_seen,v_item->>'category');
 END LOOP;
 IF v_sum<>abs(p_amount) THEN RAISE EXCEPTION 'cash allocations must exactly equal the complete source line'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_g public.finance_groups%ROWTYPE;v_policy public.finance_statement_policies%ROWTYPE;v_group uuid;v_members uuid[];v_cash uuid[];v_expected uuid[];v_accounts uuid[]:='{}';v_lines uuid[]:='{}';v_item jsonb;v_allocation jsonb;v_line record;v_latest public.finance_cash_classifications%ROWTYPE;
 v_transfer numeric:=0;v_transfer_date date;v_version integer;v_type text;
BEGIN
 IF p_kind NOT IN ('STATEMENT_POLICY','CASH_FLOW_CLASSIFY') THEN RETURN public.validate_group_extension(p_entity,p_kind,p_payload); END IF;
 IF p_kind='STATEMENT_POLICY' THEN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'statement policies require two administrators'; END IF;
  IF p_payload-ARRAY['group_id','expected_version','mappings','cash_accounts']<>'{}'::jsonb OR jsonb_typeof(p_payload->'mappings') IS DISTINCT FROM 'array' OR jsonb_typeof(p_payload->'cash_accounts') IS DISTINCT FROM 'array' OR coalesce(p_payload->>'expected_version','') !~ '^[0-9]+$' THEN RAISE EXCEPTION 'invalid statement policy fields'; END IF;
  IF jsonb_array_length(p_payload->'mappings') NOT BETWEEN 1 AND 2000 OR jsonb_array_length(p_payload->'cash_accounts')>500 THEN RAISE EXCEPTION 'statement policy exceeds supported account capacity'; END IF;
  v_group:=(p_payload->>'group_id')::uuid;v_members:=ARRAY[p_entity];
  IF v_group IS NOT NULL THEN SELECT * INTO v_g FROM public.finance_groups WHERE id=v_group AND entity_id=p_entity AND org_id=v_org;IF v_g.id IS NULL THEN RAISE EXCEPTION 'reporting group unavailable'; END IF;v_members:=v_g.member_ids;END IF;
  v_policy:=public.latest_statement_policy(p_entity,v_group);
  IF coalesce(v_policy.version,0)<>(p_payload->>'expected_version')::int THEN RAISE EXCEPTION 'statement policy changed; reload its current version'; END IF;
  v_cash:=ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(p_payload->'cash_accounts') ORDER BY value::uuid);
  SELECT coalesce(array_agg(DISTINCT account_id ORDER BY account_id),'{}') INTO v_expected FROM public.cash_registers WHERE entity_id=ANY(v_members) AND org_id=v_org;
  IF v_cash IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'statement cash accounts must include each registered cash account exactly once'; END IF;
  IF EXISTS(SELECT 1 FROM public.entity_customer_receipt_controls WHERE entity_id=ANY(v_members) AND NOT (cash_account_id=ANY(v_cash))) OR EXISTS(SELECT 1 FROM public.entity_supplier_payment_controls WHERE entity_id=ANY(v_members) AND NOT (cash_account_id=ANY(v_cash))) THEN RAISE EXCEPTION 'register the configured receipt and payment cash accounts before approving presentation'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'mappings') LOOP
   IF v_item-ARRAY['account_id','section']<>'{}'::jsonb OR (v_item->>'account_id')::uuid=ANY(v_accounts) THEN RAISE EXCEPTION 'statement mappings require unique account identities'; END IF;
   SELECT account_type INTO v_type FROM public.finance_statement_sections() WHERE section=v_item->>'section';
   IF v_type IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(v_item->>'account_id')::uuid AND org_id=v_org AND account_type::text=v_type) THEN RAISE EXCEPTION 'statement section must match the tenant account type'; END IF;
   IF (v_item->>'section' IN ('CASH','RESTRICTED_CASH_CURRENT','RESTRICTED_CASH_NONCURRENT'))<>((v_item->>'account_id')::uuid=ANY(v_cash)) THEN RAISE EXCEPTION 'cash presentation must exactly match registered cash accounts'; END IF;
   v_accounts:=array_append(v_accounts,(v_item->>'account_id')::uuid);
  END LOOP;
  IF NOT (v_cash<@v_accounts) THEN RAISE EXCEPTION 'every cash account needs its explicit presentation mapping'; END IF;
 ELSE
  IF p_payload-ARRAY['policy_id','items']<>'{}'::jsonb OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'classify one to 200 complete cash lines per approval'; END IF;
  v_policy:=public.latest_statement_policy(p_entity,NULL);
  IF v_policy.id IS NULL OR v_policy.id IS DISTINCT FROM (p_payload->>'policy_id')::uuid THEN RAISE EXCEPTION 'current entity statement policy required'; END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
   IF v_item-ARRAY['line_id','expected_version','allocations']<>'{}'::jsonb OR coalesce(v_item->>'expected_version','') !~ '^[0-9]+$' OR (v_item->>'line_id')::uuid=ANY(v_lines) THEN RAISE EXCEPTION 'cash lines and their current versions must be unique'; END IF;
   SELECT l.id,l.account_id,l.debit-l.credit AS amount,j.id AS journal_id,j.entry_date INTO v_line FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id
    WHERE l.id=(v_item->>'line_id')::uuid AND j.entity_id=p_entity AND j.org_id=v_org AND j.status='posted' AND l.account_id=ANY(v_policy.cash_accounts);
   IF v_line.id IS NULL THEN RAISE EXCEPTION 'posted cash source unavailable'; END IF;
   IF EXISTS(SELECT 1 FROM public.finance_consolidations c JOIN public.finance_groups g ON g.id=c.group_id WHERE c.org_id=v_org AND c.active AND p_entity=ANY(g.member_ids) AND c.ends_on>=v_line.entry_date) THEN RAISE EXCEPTION 'reopen the consolidated cutoff before changing historical cash classifications'; END IF;
   PERFORM public.get_entity_trial_balance(p_entity,v_line.entry_date,v_line.entry_date);PERFORM public.validate_cash_allocations(v_item->'allocations',v_line.amount);
   SELECT * INTO v_latest FROM public.finance_cash_classifications WHERE line_id=v_line.id ORDER BY version DESC LIMIT 1;
   IF coalesce(v_latest.version,0)<>(v_item->>'expected_version')::int THEN RAISE EXCEPTION 'cash classification changed; review the current version'; END IF;
   v_lines:=array_append(v_lines,v_line.id);
   FOR v_allocation IN SELECT value FROM jsonb_array_elements(v_item->'allocations') WHERE value->>'category'='TRANSFER' LOOP
    IF v_transfer_date IS NOT NULL AND v_transfer_date<>v_line.entry_date THEN RAISE EXCEPTION 'internal cash offsets must share an accounting date'; END IF;
    v_transfer_date:=v_line.entry_date;v_transfer:=v_transfer+sign(v_line.amount)*(v_allocation->>'amount')::numeric;
   END LOOP;
  END LOOP;
  IF v_transfer<>0 THEN RAISE EXCEPTION 'internal cash transfer allocations must offset exactly within the approval'; END IF;
  IF EXISTS(WITH current AS (SELECT DISTINCT ON(line_id) * FROM public.finance_cash_classifications WHERE entity_id=p_entity ORDER BY line_id,version DESC), changed_transfers AS (
   SELECT request_id FROM current WHERE line_id=ANY(v_lines) AND EXISTS(SELECT 1 FROM jsonb_array_elements(allocations) a WHERE a->>'category'='TRANSFER')
  ) SELECT 1 FROM current c WHERE request_id IN (SELECT request_id FROM changed_transfers) AND NOT (line_id=ANY(v_lines)) AND EXISTS(SELECT 1 FROM jsonb_array_elements(c.allocations) a WHERE a->>'category'='TRANSFER')) THEN RAISE EXCEPTION 'reclassify every active side of an earlier internal transfer together'; END IF;
 END IF;
 RETURN p_payload;
END; $$;

CREATE OR REPLACE FUNCTION public.finance_source_snapshot(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_policy public.finance_statement_policies%ROWTYPE;v_accounts jsonb;v_rows jsonb;v_members uuid[]:=ARRAY[p_entity];
BEGIN
 IF p_kind='STATEMENT_POLICY' THEN
  v_policy:=public.latest_statement_policy(p_entity,(p_payload->>'group_id')::uuid);
  IF p_payload->>'group_id' IS NOT NULL THEN SELECT member_ids INTO v_members FROM public.finance_groups WHERE id=(p_payload->>'group_id')::uuid AND org_id=public.get_user_org_id();END IF;
  SELECT jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'type',account_type) ORDER BY id) INTO v_accounts FROM public.accounts WHERE org_id=public.get_user_org_id() AND id IN (SELECT (value->>'account_id')::uuid FROM jsonb_array_elements(p_payload->'mappings'));
  SELECT coalesce(jsonb_agg(jsonb_build_object('entity',entity_id,'account',account_id,'register',id,'name',name) ORDER BY entity_id,account_id),'[]') INTO v_rows FROM public.cash_registers WHERE org_id=public.get_user_org_id() AND entity_id=ANY(v_members);
  RETURN jsonb_build_object('previous_policy',v_policy.id,'previous_version',coalesce(v_policy.version,0),'accounts',v_accounts,'cash_sources',v_rows);
 ELSIF p_kind='CASH_FLOW_CLASSIFY' THEN
  v_policy:=public.latest_statement_policy(p_entity,NULL);
  SELECT jsonb_agg(jsonb_build_object('line_id',l.id,'account_id',l.account_id,'journal_id',j.id,'number',j.entry_number,'date',j.entry_date,'amount',round(l.debit-l.credit,2)::text,'version',coalesce(c.version,0),'previous_allocations',c.allocations) ORDER BY l.id) INTO v_rows
   FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id LEFT JOIN LATERAL(SELECT version,allocations FROM public.finance_cash_classifications WHERE line_id=l.id ORDER BY version DESC LIMIT 1)c ON true
   WHERE j.org_id=public.get_user_org_id() AND j.entity_id=p_entity AND l.id IN (SELECT (value->>'line_id')::uuid FROM jsonb_array_elements(p_payload->'items'));
  RETURN jsonb_build_object('policy_id',v_policy.id,'policy_version',v_policy.version,'cash_lines',v_rows);
 END IF;RETURN public.group_source_snapshot(p_entity,p_kind,p_payload);
END; $$;
CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p jsonb:=p_request.payload;v_id uuid;v_ids uuid[]:='{}';v_item jsonb;
BEGIN
 IF p_request.kind='STATEMENT_POLICY' THEN
  INSERT INTO public.finance_statement_policies(org_id,entity_id,group_id,version,mappings,cash_accounts,request_id)
   VALUES(p_request.org_id,p_request.entity_id,(v_p->>'group_id')::uuid,(v_p->>'expected_version')::int+1,v_p->'mappings',ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(v_p->'cash_accounts') ORDER BY value::uuid),p_request.id) RETURNING id INTO v_id;
  RETURN jsonb_build_object('policyId',v_id,'version',(v_p->>'expected_version')::int+1);
 ELSIF p_request.kind='CASH_FLOW_CLASSIFY' THEN
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_p->'items') LOOP
   INSERT INTO public.finance_cash_classifications(org_id,entity_id,line_id,version,policy_id,allocations,request_id)
    VALUES(p_request.org_id,p_request.entity_id,(v_item->>'line_id')::uuid,(v_item->>'expected_version')::int+1,(v_p->>'policy_id')::uuid,v_item->'allocations',p_request.id) RETURNING id INTO v_id;
   v_ids:=array_append(v_ids,v_id);
  END LOOP;RETURN jsonb_build_object('classificationIds',v_ids);
 END IF;RETURN public.execute_group_extension(p_request);
END; $$;

CREATE OR REPLACE FUNCTION public.validate_statement_policy_graph(p_policy uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p public.finance_statement_policies%ROWTYPE;v_r public.finance_requests%ROWTYPE;
BEGIN
 SELECT * INTO v_p FROM public.finance_statement_policies WHERE id=p_policy;SELECT * INTO v_r FROM public.finance_requests WHERE id=v_p.request_id AND org_id=v_p.org_id AND entity_id=v_p.entity_id AND kind='STATEMENT_POLICY' AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by;
 IF v_p.id IS NULL OR v_r.id IS NULL OR v_p.version IS DISTINCT FROM (v_r.payload->>'expected_version')::int+1 OR v_p.group_id IS DISTINCT FROM (v_r.payload->>'group_id')::uuid OR v_p.mappings IS DISTINCT FROM v_r.payload->'mappings' OR v_p.cash_accounts IS DISTINCT FROM ARRAY(SELECT value::uuid FROM jsonb_array_elements_text(v_r.payload->'cash_accounts') ORDER BY value::uuid) THEN RAISE EXCEPTION 'statement policy approval lineage mismatch'; END IF;
 IF v_p.version>1 AND NOT EXISTS(SELECT 1 FROM public.finance_statement_policies WHERE entity_id=v_p.entity_id AND group_id IS NOT DISTINCT FROM v_p.group_id AND version=v_p.version-1 AND id=(v_r.source_snapshot->>'previous_policy')::uuid) THEN RAISE EXCEPTION 'statement policy version history is incomplete';END IF;
 IF v_p.group_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_groups WHERE id=v_p.group_id AND org_id=v_p.org_id AND entity_id=v_p.entity_id) THEN RAISE EXCEPTION 'group statement policy parent mismatch'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(v_p.mappings)m WHERE NOT EXISTS(SELECT 1 FROM public.accounts a JOIN public.finance_statement_sections()s ON s.account_type=a.account_type::text WHERE a.id=(m->>'account_id')::uuid AND a.org_id=v_p.org_id AND s.section=m->>'section')) THEN RAISE EXCEPTION 'statement mapping account lineage mismatch'; END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.validate_cash_classification_graph(p_classification uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_c public.finance_cash_classifications%ROWTYPE;v_r public.finance_requests%ROWTYPE;v_p public.finance_statement_policies%ROWTYPE;v_item jsonb;v_line record;
BEGIN
 SELECT * INTO v_c FROM public.finance_cash_classifications WHERE id=p_classification;SELECT * INTO v_p FROM public.finance_statement_policies WHERE id=v_c.policy_id;
 SELECT * INTO v_r FROM public.finance_requests WHERE id=v_c.request_id AND org_id=v_c.org_id AND entity_id=v_c.entity_id AND kind='CASH_FLOW_CLASSIFY' AND state IN ('APPROVED','EXECUTING') AND requested_by<>decided_by;
 SELECT value INTO v_item FROM jsonb_array_elements(v_r.payload->'items') WHERE value->>'line_id'=v_c.line_id::text;
 SELECT l.account_id,l.debit-l.credit AS amount,j.org_id,j.entity_id,j.entry_date,j.status INTO v_line FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE l.id=v_c.line_id;
 IF v_c.id IS NULL OR v_r.id IS NULL OR v_item IS NULL OR v_p.id IS NULL OR v_line.account_id IS NULL OR v_p.entity_id<>v_c.entity_id OR v_p.group_id IS NOT NULL OR v_p.org_id<>v_c.org_id OR v_c.policy_id IS DISTINCT FROM (v_r.payload->>'policy_id')::uuid OR v_c.allocations IS DISTINCT FROM v_item->'allocations' OR v_c.version IS DISTINCT FROM (v_item->>'expected_version')::int+1 OR v_line.entity_id<>v_c.entity_id OR v_line.org_id<>v_c.org_id OR v_line.status<>'posted' OR NOT (v_line.account_id=ANY(v_p.cash_accounts)) THEN RAISE EXCEPTION 'cash classification source or approval mismatch'; END IF;
 IF v_c.version>1 AND NOT EXISTS(SELECT 1 FROM public.finance_cash_classifications WHERE line_id=v_c.line_id AND version=v_c.version-1 AND org_id=v_c.org_id AND entity_id=v_c.entity_id) THEN RAISE EXCEPTION 'cash classification version history is incomplete'; END IF;
 PERFORM public.validate_cash_allocations(v_c.allocations,v_line.amount);PERFORM public.validate_statement_policy_graph(v_p.id);
 IF EXISTS(WITH current AS (SELECT DISTINCT ON(line_id) * FROM public.finance_cash_classifications WHERE entity_id=v_c.entity_id ORDER BY line_id,version DESC)
  SELECT c.request_id FROM current c JOIN public.journal_lines l ON l.id=c.line_id CROSS JOIN LATERAL jsonb_array_elements(c.allocations)a WHERE a->>'category'='TRANSFER' AND c.request_id=v_c.request_id GROUP BY c.request_id HAVING sum(sign(l.debit-l.credit)*(a->>'amount')::numeric)<>0) THEN RAISE EXCEPTION 'active internal cash allocations do not offset'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_statement_policy_context(p_entity uuid,p_group uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p public.finance_statement_policies%ROWTYPE;v_members uuid[]:=ARRAY[p_entity];v_cash uuid[];v_accounts jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity AND org_id=public.get_user_org_id()) THEN RAISE EXCEPTION 'statement entity unavailable'; END IF;
 IF p_group IS NOT NULL THEN SELECT member_ids INTO v_members FROM public.finance_groups WHERE id=p_group AND entity_id=p_entity AND org_id=public.get_user_org_id();IF v_members IS NULL THEN RAISE EXCEPTION 'statement group unavailable';END IF;END IF;
 v_p:=public.latest_statement_policy(p_entity,p_group);IF v_p.id IS NOT NULL THEN PERFORM public.validate_statement_policy_graph(v_p.id);END IF;
 IF (SELECT count(*) FROM public.accounts WHERE org_id=public.get_user_org_id())>2000 THEN RAISE EXCEPTION 'statement chart exceeds 2000 accounts; a larger reviewed reporting capacity is required';END IF;
 SELECT coalesce(array_agg(DISTINCT account_id ORDER BY account_id),'{}') INTO v_cash FROM public.cash_registers WHERE org_id=public.get_user_org_id() AND entity_id=ANY(v_members);
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'type',account_type,'active',is_active) ORDER BY code,id),'[]') INTO v_accounts FROM public.accounts WHERE org_id=public.get_user_org_id();
 RETURN jsonb_build_object('entityId',p_entity,'groupId',p_group,'policy',CASE WHEN v_p.id IS NOT NULL THEN to_jsonb(v_p) ELSE NULL END,'cashAccounts',v_cash,'accounts',v_accounts,
  'sections',(SELECT jsonb_agg(to_jsonb(s) ORDER BY sort) FROM public.finance_statement_sections()s),'categories',(SELECT jsonb_agg(to_jsonb(c) ORDER BY sort) FROM public.finance_cash_categories()c));
END; $$;

-- Current presentation is a versioned view of immutable ledger lines. Prior
-- classifications stay available in the approval history and frozen group reports.
CREATE OR REPLACE FUNCTION public.get_entity_cash_flow(p_entity uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p public.finance_statement_policies%ROWTYPE;v_trial jsonb;v_cash uuid[];v_rows jsonb;v_categories jsonb;v_c record;v_open numeric;v_close numeric;v_net numeric;v_unknown numeric;v_unknown_count integer;v_transfers numeric;v_result jsonb;v_coverage boolean;
BEGIN
 v_trial:=public.get_entity_trial_balance(p_entity,p_from,p_through);v_p:=public.latest_statement_policy(p_entity,NULL);
 IF v_p.id IS NULL THEN RAISE EXCEPTION 'approve an entity statement policy before preparing cash flow'; END IF;
 PERFORM public.validate_statement_policy_graph(v_p.id);
 SELECT coalesce(array_agg(DISTINCT account_id ORDER BY account_id),'{}') INTO v_cash FROM public.cash_registers WHERE org_id=v_p.org_id AND entity_id=p_entity;
 v_coverage:=v_cash=v_p.cash_accounts AND NOT EXISTS(SELECT 1 FROM public.entity_customer_receipt_controls WHERE entity_id=p_entity AND NOT(cash_account_id=ANY(v_cash))) AND NOT EXISTS(SELECT 1 FROM public.entity_supplier_payment_controls WHERE entity_id=p_entity AND NOT(cash_account_id=ANY(v_cash)));
 SELECT coalesce(sum((r->>'openingDebit')::numeric-(r->>'openingCredit')::numeric),0),coalesce(sum((r->>'closingDebit')::numeric-(r->>'closingCredit')::numeric),0) INTO v_open,v_close FROM jsonb_array_elements(v_trial->'rows')r WHERE (r->>'accountId')::uuid=ANY(v_cash);
 IF (SELECT count(*) FROM public.journal_entries j JOIN public.journal_lines l ON l.journal_entry_id=j.id WHERE j.org_id=v_p.org_id AND j.entity_id=p_entity AND j.status='posted' AND j.entry_date BETWEEN p_from AND p_through AND l.account_id=ANY(v_cash))>20000 THEN RAISE EXCEPTION 'cash-flow interval exceeds 20000 lines; use a narrower interval or a reviewed larger reporting capacity'; END IF;
 FOR v_c IN SELECT DISTINCT ON(c.line_id)c.id,c.line_id,c.version FROM public.finance_cash_classifications c JOIN public.journal_lines l ON l.id=c.line_id JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE c.entity_id=p_entity AND c.org_id=v_p.org_id AND j.entry_date BETWEEN p_from AND p_through ORDER BY c.line_id,c.version DESC LOOP PERFORM public.validate_cash_classification_graph(v_c.id);END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('lineId',l.id,'journalId',j.id,'number',j.entry_number,'date',j.entry_date,'accountId',l.account_id,'code',a.code,'name',a.name,'amount',round(l.debit-l.credit,2)::text,'classificationId',c.id,'version',coalesce(c.version,0),'allocations',coalesce((SELECT jsonb_agg(a||jsonb_build_object('amount',round((a->>'amount')::numeric,2)::text)) FROM jsonb_array_elements(c.allocations)a),'[]')) ORDER BY j.entry_date,j.id,l.id),'[]') INTO v_rows
 FROM public.journal_entries j JOIN public.journal_lines l ON l.journal_entry_id=j.id JOIN public.accounts a ON a.id=l.account_id
 LEFT JOIN LATERAL(SELECT id,version,allocations FROM public.finance_cash_classifications WHERE line_id=l.id AND org_id=v_p.org_id ORDER BY version DESC LIMIT 1)c ON true
 WHERE j.org_id=v_p.org_id AND j.entity_id=p_entity AND j.status='posted' AND j.entry_date BETWEEN p_from AND p_through AND l.account_id=ANY(v_cash);
 SELECT count(*),coalesce(sum((r->>'amount')::numeric),0) INTO v_unknown_count,v_unknown FROM jsonb_array_elements(v_rows)r WHERE r->>'classificationId' IS NULL;
 SELECT coalesce(jsonb_agg(jsonb_build_object('category',category,'label',label,'section',section,'receipts',round(receipts,2)::text,'payments',round(payments,2)::text,'net',round(receipts-payments,2)::text) ORDER BY sort),'[]') INTO v_categories FROM (
  SELECT k.*,coalesce(sum((a->>'amount')::numeric) FILTER(WHERE (r->>'amount')::numeric>0),0) AS receipts,coalesce(sum((a->>'amount')::numeric) FILTER(WHERE (r->>'amount')::numeric<0),0) AS payments
  FROM public.finance_cash_categories()k LEFT JOIN (jsonb_array_elements(v_rows)r CROSS JOIN LATERAL jsonb_array_elements(r->'allocations')a) ON a->>'category'=k.category GROUP BY k.category,k.label,k.section,k.sort
 ) grouped;
 SELECT coalesce(sum((c->>'net')::numeric),0),coalesce(sum((c->>'net')::numeric) FILTER(WHERE c->>'section'='TRANSFER'),0) INTO v_net,v_transfers FROM jsonb_array_elements(v_categories)c;
 IF v_open+v_net+v_unknown<>v_close THEN RAISE EXCEPTION 'cash-flow source lines do not reconcile to the registered cash ledger'; END IF;
 v_result:=jsonb_build_object('entityId',p_entity,'currency',v_trial->>'currency','from',p_from,'through',p_through,'policyId',v_p.id,'policyVersion',v_p.version,'cashAccounts',v_cash,'cashCoverageComplete',v_coverage,'ledgerRevision',v_trial->>'revision',
  'openingCash',round(v_open,2)::text,'closingCash',round(v_close,2)::text,'classifiedMovement',round(v_net,2)::text,'unclassifiedMovement',round(v_unknown,2)::text,'unclassifiedCount',v_unknown_count,'transferNet',round(v_transfers,2)::text,'categories',v_categories,'sources',v_rows,
  'complete',v_coverage AND v_unknown_count=0 AND v_transfers=0);
 RETURN v_result||jsonb_build_object('revision',md5(v_result::text),'generatedAt',statement_timestamp());
END; $$;

CREATE OR REPLACE FUNCTION public.apply_statement_policy(p_policy uuid,p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p public.finance_statement_policies%ROWTYPE;v_sections jsonb;v_unmapped jsonb;v_assets numeric;v_liabilities numeric;v_equity numeric;v_unclosed numeric;v_net numeric;v_revenue numeric;v_cost numeric;v_opex numeric;v_mapped_net numeric;
BEGIN
 SELECT * INTO v_p FROM public.finance_statement_policies WHERE id=p_policy;IF v_p.id IS NULL THEN RAISE EXCEPTION 'approved statement policy unavailable'; END IF;
 PERFORM public.validate_statement_policy_graph(v_p.id);
 IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_rows)r WHERE NOT EXISTS(SELECT 1 FROM public.accounts a WHERE a.id=(r->>'accountId')::uuid AND a.org_id=v_p.org_id AND a.account_type::text=r->>'accountType')) THEN RAISE EXCEPTION 'statement source account lineage mismatch';END IF;
 SELECT coalesce(jsonb_agg(r ORDER BY r->>'code',r->>'accountId'),'[]') INTO v_unmapped FROM jsonb_array_elements(p_rows)r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_p.mappings)m WHERE m->>'account_id'=r->>'accountId');
 SELECT jsonb_agg(jsonb_build_object('section',s.section,'label',s.label,'accountType',s.account_type,'basis',s.basis,'sign',s.sign,'total',round(coalesce(b.total,0),2)::text,'rows',coalesce(b.rows,'[]')) ORDER BY s.sort) INTO v_sections
 FROM public.finance_statement_sections()s LEFT JOIN LATERAL(
  SELECT sum((r->>s.basis)::numeric*s.sign) AS total,jsonb_agg(r||jsonb_build_object('amount',round((r->>s.basis)::numeric*s.sign,2)::text) ORDER BY r->>'code',r->>'accountId') AS rows
  FROM jsonb_array_elements(p_rows)r JOIN jsonb_array_elements(v_p.mappings)m ON m->>'account_id'=r->>'accountId' WHERE m->>'section'=s.section
 ) b ON true;
 SELECT coalesce(sum((r->>'closing')::numeric) FILTER(WHERE r->>'accountType'='asset'),0),-coalesce(sum((r->>'closing')::numeric) FILTER(WHERE r->>'accountType'='liability'),0),-coalesce(sum((r->>'closing')::numeric) FILTER(WHERE r->>'accountType'='equity'),0),-coalesce(sum((r->>'closing')::numeric) FILTER(WHERE r->>'accountType' IN ('revenue','expense')),0),-coalesce(sum((r->>'income')::numeric),0) INTO v_assets,v_liabilities,v_equity,v_unclosed,v_net FROM jsonb_array_elements(p_rows)r;
 IF v_assets<>v_liabilities+v_equity+v_unclosed THEN RAISE EXCEPTION 'mapped balance sheet does not reconcile to source account balances';END IF;
 SELECT coalesce(sum((s->>'total')::numeric) FILTER(WHERE s->>'section'='REVENUE'),0),coalesce(sum((s->>'total')::numeric) FILTER(WHERE s->>'section'='COST_OF_REVENUE'),0),coalesce(sum((s->>'total')::numeric) FILTER(WHERE s->>'section'='OPERATING_EXPENSES'),0),coalesce(sum((s->>'total')::numeric*CASE WHEN s->>'accountType'='revenue' THEN 1 ELSE -1 END) FILTER(WHERE s->>'basis'='income'),0) INTO v_revenue,v_cost,v_opex,v_mapped_net FROM jsonb_array_elements(v_sections)s;
 RETURN jsonb_build_object('policyId',v_p.id,'policyVersion',v_p.version,'sections',v_sections,'unmapped',v_unmapped,'assets',round(v_assets,2)::text,'liabilities',round(v_liabilities,2)::text,'recordedEquity',round(v_equity,2)::text,'unclosedEarnings',round(v_unclosed,2)::text,'totalEquity',round(v_equity+v_unclosed,2)::text,'liabilitiesAndEquity',round(v_liabilities+v_equity+v_unclosed,2)::text,'grossProfit',round(v_revenue-v_cost,2)::text,'operatingProfit',round(v_revenue-v_cost-v_opex,2)::text,'netIncome',round(v_net,2)::text,'complete',jsonb_array_length(v_unmapped)=0 AND v_net=v_mapped_net);
END; $$;

CREATE OR REPLACE FUNCTION public.get_entity_financial_statements(p_entity uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_trial jsonb;v_p public.finance_statement_policies%ROWTYPE;v_rows jsonb;v_statements jsonb;v_cash jsonb;v_result jsonb;v_cash_balance numeric;
BEGIN
 v_trial:=public.get_entity_trial_balance(p_entity,p_from,p_through);v_p:=public.latest_statement_policy(p_entity,NULL);IF v_p.id IS NULL THEN RAISE EXCEPTION 'approve an entity statement policy before preparing mapped statements'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('accountId',r->>'accountId','code',r->>'code','name',r->>'name','accountType',r->>'accountType',
  'closing',round((r->>'closingDebit')::numeric-(r->>'closingCredit')::numeric,2)::text,'income',round(CASE WHEN r->>'accountType' IN ('revenue','expense') THEN (r->>'periodDebit')::numeric-(r->>'periodCredit')::numeric-coalesce((f->>'debit')::numeric,0)+coalesce((f->>'credit')::numeric,0) ELSE 0 END,2)::text) ORDER BY r->>'code',r->>'accountId'),'[]') INTO v_rows
 FROM jsonb_array_elements(v_trial->'rows')r LEFT JOIN jsonb_array_elements(v_trial->'fiscalClosingActivity')f ON f->>'accountId'=r->>'accountId';
 v_statements:=public.apply_statement_policy(v_p.id,v_rows);v_cash:=public.get_entity_cash_flow(p_entity,p_from,p_through)-'generatedAt';
 SELECT sum((s->>'total')::numeric) INTO v_cash_balance FROM jsonb_array_elements(v_statements->'sections')s WHERE s->>'section' IN ('CASH','RESTRICTED_CASH_CURRENT','RESTRICTED_CASH_NONCURRENT');
 v_result:=jsonb_build_object('entityId',p_entity,'entityName',v_trial->>'entityName','currency',v_trial->>'currency','from',p_from,'through',p_through,'ledgerRevision',v_trial->>'revision','statements',v_statements,'cashFlow',v_cash,'cashBalanceAgrees',v_cash_balance=(v_cash->>'closingCash')::numeric,'complete',(v_statements->>'complete')::boolean AND (v_cash->>'complete')::boolean AND v_cash_balance=(v_cash->>'closingCash')::numeric);
 RETURN v_result||jsonb_build_object('revision',md5(v_result::text),'generatedAt',statement_timestamp());
END; $$;

DO $$ BEGIN IF to_regprocedure('public.get_pre_statement_close_check(uuid,date,date)') IS NULL THEN ALTER FUNCTION public.get_finance_close_check(uuid,date,date) RENAME TO get_pre_statement_close_check;END IF;END; $$;
CREATE OR REPLACE FUNCTION public.get_finance_close_check(p_entity uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;v_p public.finance_statement_policies%ROWTYPE;v_statements jsonb;
BEGIN
 v_result:=public.get_pre_statement_close_check(p_entity,p_from,p_through)-'revision'-'generatedAt';v_p:=public.latest_statement_policy(p_entity,NULL);
 IF v_p.id IS NOT NULL THEN v_statements:=public.get_entity_financial_statements(p_entity,p_from,p_through)-'generatedAt';
  v_result:=v_result||jsonb_build_object('statementControls',jsonb_build_object('configured',true,'policyId',v_p.id,'policyVersion',v_p.version,'revision',v_statements->>'revision','unmappedAccounts',jsonb_array_length(v_statements->'statements'->'unmapped'),'unclassifiedCashLines',v_statements->'cashFlow'->'unclassifiedCount','complete',(v_statements->>'complete')::boolean),'canClose',(v_result->>'canClose')::boolean AND (v_statements->>'complete')::boolean);
 ELSE v_result:=v_result||jsonb_build_object('statementControls',jsonb_build_object('configured',false,'complete',false));END IF;
 RETURN v_result||jsonb_build_object('revision',md5(v_result::text),'generatedAt',statement_timestamp());
END; $$;

CREATE OR REPLACE FUNCTION public.check_statement_graph_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='finance_statement_policies' THEN PERFORM public.validate_statement_policy_graph(NEW.id);ELSE PERFORM public.validate_cash_classification_graph(NEW.id);END IF;RETURN NULL;
END; $$;
DO $$ DECLARE t text;f record;
BEGIN
 FOREACH t IN ARRAY ARRAY['finance_statement_policies','finance_cash_classifications'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(org_id=public.get_user_org_id())',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS statement_graph ON public.%I',t);EXECUTE format('CREATE CONSTRAINT TRIGGER statement_graph AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_statement_graph_trigger()',t);
 END LOOP;
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
 ('validate_finance_extension','execute_finance_extension','finance_source_snapshot','validate_group_extension','execute_group_extension','group_source_snapshot','finance_statement_sections','finance_cash_categories','latest_statement_policy','validate_cash_allocations','validate_statement_policy_graph','validate_cash_classification_graph','get_statement_policy_context','get_entity_cash_flow','apply_statement_policy','get_entity_financial_statements','get_finance_close_check','get_pre_statement_close_check','check_statement_graph_trigger') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);IF f.proname IN ('get_statement_policy_context','get_entity_cash_flow','get_entity_financial_statements','get_finance_close_check') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
END; $$;
NOTIFY pgrst,'reload schema';
COMMIT;
