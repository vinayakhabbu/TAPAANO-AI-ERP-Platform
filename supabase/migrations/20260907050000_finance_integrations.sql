BEGIN;
-- The public approval dispatcher remains a closed set of actions. Preserve contract handlers.
DO $$ BEGIN
 IF to_regprocedure('public.validate_contract_extension(uuid,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.validate_finance_extension(uuid,text,jsonb) RENAME TO validate_contract_extension;
  ALTER FUNCTION public.execute_finance_extension(public.finance_requests) RENAME TO execute_contract_extension;
  ALTER FUNCTION public.finance_source_snapshot(uuid,text,jsonb) RENAME TO contract_source_snapshot;
 END IF;
END; $$;

CREATE TABLE IF NOT EXISTS public.finance_connections (
 id uuid PRIMARY KEY,org_id uuid NOT NULL,entity_id uuid NOT NULL,label text NOT NULL,
 provider text NOT NULL CHECK(provider IN ('STRIPE','GENERIC')),provider_account text NOT NULL,
 environment text NOT NULL CHECK(environment IN ('TEST','LIVE')),currency text NOT NULL,timezone text NOT NULL,
 clearing_account_id uuid NOT NULL,enabled boolean NOT NULL,version integer NOT NULL,request_id uuid NOT NULL,
 UNIQUE(org_id,id),UNIQUE(org_id,provider,provider_account,environment),UNIQUE(entity_id,clearing_account_id),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,clearing_account_id) REFERENCES public.accounts(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id)
);
CREATE TABLE IF NOT EXISTS public.finance_inbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,connection_id uuid NOT NULL,
 operation text NOT NULL CHECK(operation IN ('RECEIPT','PAYOUT','USAGE','JOURNAL','UNSUPPORTED')),
 object_id text NOT NULL,source jsonb NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),
 state text NOT NULL DEFAULT 'RECEIVED' CHECK(state IN ('RECEIVED','APPLIED','IGNORED','REVERSED')),
 request_id uuid,result jsonb,reversal_request uuid,reversal_result jsonb,
 UNIQUE(org_id,id),UNIQUE(connection_id,operation,object_id),
 FOREIGN KEY(org_id,connection_id) REFERENCES public.finance_connections(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id),
 FOREIGN KEY(org_id,reversal_request) REFERENCES public.finance_requests(org_id,id)
);
CREATE TABLE IF NOT EXISTS public.finance_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,connection_id uuid NOT NULL,inbox_id uuid NOT NULL,
 external_event_id text NOT NULL,body_sha256 text NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(connection_id,external_event_id),FOREIGN KEY(org_id,connection_id) REFERENCES public.finance_connections(org_id,id),
 FOREIGN KEY(org_id,inbox_id) REFERENCES public.finance_inbox(org_id,id)
);

-- Service access is deliberately limited to these two functions. Signing credentials live outside the database.
CREATE OR REPLACE FUNCTION public.get_finance_connection(p_connection uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',id,'provider',provider,'account',provider_account,'environment',environment,'currency',currency,'timezone',timezone,'enabled',enabled)
 FROM public.finance_connections WHERE id=p_connection
$$;
CREATE OR REPLACE FUNCTION public.enqueue_finance_event(p_connection uuid,p_external_id text,p_operation text,p_object_id text,p_source jsonb,p_body_sha256 text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_c public.finance_connections%ROWTYPE;v_i public.finance_inbox%ROWTYPE;v_d public.finance_deliveries%ROWTYPE;v_id uuid;
BEGIN
 LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO v_c FROM public.finance_connections WHERE id=p_connection AND enabled;
 IF v_c.id IS NULL THEN RAISE EXCEPTION 'connection unavailable'; END IF;
 IF length(coalesce(p_external_id,'')) NOT BETWEEN 1 AND 200 OR length(coalesce(p_object_id,'')) NOT BETWEEN 1 AND 200 OR
  p_operation IS NULL OR p_operation NOT IN ('RECEIPT','PAYOUT','USAGE','JOURNAL','UNSUPPORTED') OR
  coalesce(p_body_sha256,'') !~ '^[a-f0-9]{64}$' OR jsonb_typeof(p_source) IS DISTINCT FROM 'object' OR octet_length(p_source::text)>100000 THEN RAISE EXCEPTION 'invalid event envelope'; END IF;
 IF p_source-ARRAY['currency','date','amount','units','occurred_at','lines','type','reference']<>'{}'::jsonb THEN RAISE EXCEPTION 'unknown source fields'; END IF;
 IF p_operation IN ('RECEIPT','PAYOUT','JOURNAL') THEN
  IF p_source->>'currency' IS DISTINCT FROM v_c.currency OR coalesce(p_source->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (p_source->>'date')::date NOT BETWEEN DATE '0001-01-01' AND DATE '9999-12-31' THEN RAISE EXCEPTION 'event currency or accounting date unavailable'; END IF;
 END IF;
 IF p_operation IN ('RECEIPT','PAYOUT') AND (jsonb_typeof(p_source->'amount') IS DISTINCT FROM 'string' OR public.cash_amount(p_source->>'amount')<=0) THEN RAISE EXCEPTION 'positive exact event amount required'; END IF;
 IF p_operation='USAGE' AND (jsonb_typeof(p_source->'units') IS DISTINCT FROM 'string' OR coalesce(p_source->>'units','') !~ '^[0-9]{1,15}(\.[0-9]{1,6})?$' OR (p_source->>'units')::numeric<=0 OR coalesce(p_source->>'occurred_at','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$') THEN RAISE EXCEPTION 'positive exact usage and timestamp with offset required'; END IF;
 IF p_operation='JOURNAL' AND (jsonb_typeof(p_source->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_source->'lines') NOT BETWEEN 2 AND 500) THEN RAISE EXCEPTION 'journal source lines required'; END IF;
 SELECT * INTO v_d FROM public.finance_deliveries WHERE connection_id=p_connection AND external_event_id=p_external_id;
 IF v_d.id IS NOT NULL THEN
  SELECT * INTO v_i FROM public.finance_inbox WHERE id=v_d.inbox_id;
  IF v_i.operation<>p_operation OR v_i.object_id<>p_object_id OR v_i.source IS DISTINCT FROM p_source THEN RAISE EXCEPTION 'event idempotency conflict'; END IF;
  RETURN v_i.id;
 END IF;
 SELECT * INTO v_i FROM public.finance_inbox WHERE connection_id=p_connection AND operation=p_operation AND object_id=p_object_id;
 IF v_i.id IS NOT NULL AND v_i.source IS DISTINCT FROM p_source THEN RAISE EXCEPTION 'provider object conflict; submit a separate correction source'; END IF;
 PERFORM set_config('tapaano.accounting_write','trusted',true);
 v_id:=v_i.id;
 IF v_id IS NULL THEN INSERT INTO public.finance_inbox(org_id,connection_id,operation,object_id,source) VALUES(v_c.org_id,v_c.id,p_operation,p_object_id,p_source) RETURNING id INTO v_id; END IF;
 INSERT INTO public.finance_deliveries(org_id,connection_id,inbox_id,external_event_id,body_sha256) VALUES(v_c.org_id,v_c.id,v_id,p_external_id,p_body_sha256);
 RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.integration_journal_lines(p_org uuid,p_lines jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_line jsonb;v_id uuid;v_result jsonb:='[]';
BEGIN
 IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'source journal lines unavailable'; END IF;
 FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
  IF v_line-ARRAY['account_code','debit','credit','memo']<>'{}'::jsonb THEN RAISE EXCEPTION 'unknown journal source field'; END IF;
  SELECT id INTO v_id FROM public.accounts WHERE org_id=p_org AND code=v_line->>'account_code' AND is_active;
  IF v_id IS NULL THEN RAISE EXCEPTION 'source account code unavailable: %',v_line->>'account_code'; END IF;
  v_result:=v_result||jsonb_build_array(jsonb_build_object('account_id',v_id,'debit',v_line->'debit','credit',v_line->'credit','memo',left(coalesce(v_line->>'memo','Imported journal'),240)));
 END LOOP;
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_c public.finance_connections%ROWTYPE;v_i public.finance_inbox%ROWTYPE;v_org uuid:=public.get_user_org_id();v_currency text;v_lines jsonb;
BEGIN
 IF p_kind='INTEGRATION_CONFIG' THEN
  IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'connection configuration requires an administrator'; END IF;
  IF p_payload-ARRAY['id','label','provider','provider_account','environment','timezone','clearing_account_id','enabled','expected_version']<>'{}'::jsonb OR
   length(coalesce(p_payload->>'label','')) NOT BETWEEN 1 AND 100 OR coalesce(p_payload->>'provider','') NOT IN ('STRIPE','GENERIC') OR
   length(coalesce(p_payload->>'provider_account','')) NOT BETWEEN 1 AND 150 OR coalesce(p_payload->>'environment','') NOT IN ('TEST','LIVE') OR
   jsonb_typeof(p_payload->'enabled') IS DISTINCT FROM 'boolean' OR coalesce(p_payload->>'expected_version','') !~ '^[0-9]{1,8}$' OR
   NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=p_payload->>'timezone') THEN RAISE EXCEPTION 'invalid connection configuration'; END IF;
  SELECT currency INTO v_currency FROM public.entities WHERE id=p_entity AND org_id=v_org;
  IF v_currency<>'USD' THEN RAISE EXCEPTION 'this connector supports USD entities'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=(p_payload->>'clearing_account_id')::uuid AND org_id=v_org AND is_active AND account_type='asset') THEN RAISE EXCEPTION 'active asset clearing account required'; END IF;
  IF EXISTS(SELECT 1 FROM public.entity_customer_receipt_controls WHERE org_id=v_org AND entity_id=p_entity AND ar_account_id=(p_payload->>'clearing_account_id')::uuid) OR
   EXISTS(SELECT 1 FROM public.finance_contracts WHERE org_id=v_org AND entity_id=p_entity AND terms->>'unbilled_account_id'=p_payload->>'clearing_account_id') THEN RAISE EXCEPTION 'processor clearing must be distinct from receivable control accounts'; END IF;
  SELECT * INTO v_c FROM public.finance_connections WHERE id=(p_payload->>'id')::uuid;
  IF coalesce(v_c.version,0)<>(p_payload->>'expected_version')::int THEN RAISE EXCEPTION 'connection version changed'; END IF;
  IF v_c.id IS NOT NULL AND (v_c.org_id<>v_org OR v_c.entity_id<>p_entity OR v_c.provider<>p_payload->>'provider' OR v_c.provider_account<>p_payload->>'provider_account' OR v_c.environment<>p_payload->>'environment' OR v_c.timezone<>p_payload->>'timezone' OR v_c.clearing_account_id<>(p_payload->>'clearing_account_id')::uuid) THEN RAISE EXCEPTION 'connection identity and accounting mapping are immutable'; END IF;
  RETURN p_payload;
 ELSIF p_kind NOT IN ('INTEGRATION_APPLY','INTEGRATION_IGNORE','INTEGRATION_REVERSE') THEN RETURN public.validate_contract_extension(p_entity,p_kind,p_payload);
 END IF;
 IF p_payload-ARRAY['event_id','target_id','date']<>'{}'::jsonb THEN RAISE EXCEPTION 'unknown integration action fields'; END IF;
 SELECT * INTO v_i FROM public.finance_inbox WHERE id=(p_payload->>'event_id')::uuid AND org_id=v_org;
 SELECT * INTO v_c FROM public.finance_connections WHERE id=v_i.connection_id AND entity_id=p_entity AND org_id=v_org;
 IF v_i.id IS NULL OR v_c.id IS NULL THEN RAISE EXCEPTION 'event unavailable'; END IF;
 IF p_kind='INTEGRATION_REVERSE' THEN
  IF v_i.state<>'APPLIED' OR v_i.operation NOT IN ('RECEIPT','PAYOUT','JOURNAL') OR coalesce(p_payload->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (p_payload->>'date')::date<(v_i.source->>'date')::date THEN RAISE EXCEPTION 'posted integration and subsequent correction date required'; END IF;
  RETURN p_payload;
 END IF;
 IF v_i.state<>'RECEIVED' THEN RAISE EXCEPTION 'event already decided'; END IF;
 IF p_kind='INTEGRATION_IGNORE' THEN RETURN p_payload; END IF;
 IF NOT v_c.enabled THEN RAISE EXCEPTION 'connection disabled'; END IF;
 IF EXISTS(SELECT 1 FROM public.entity_customer_receipt_controls WHERE org_id=v_org AND entity_id=p_entity AND ar_account_id=v_c.clearing_account_id) OR
  EXISTS(SELECT 1 FROM public.finance_contracts WHERE org_id=v_org AND entity_id=p_entity AND terms->>'unbilled_account_id'=v_c.clearing_account_id::text) THEN RAISE EXCEPTION 'processor clearing overlaps a receivable control account'; END IF;
 CASE v_i.operation
 WHEN 'RECEIPT' THEN
  IF NOT EXISTS(SELECT 1 FROM public.invoices WHERE id=(p_payload->>'target_id')::uuid AND entity_id=p_entity AND org_id=v_org AND currency=v_c.currency AND accounting_status='POSTED') THEN RAISE EXCEPTION 'matching posted customer invoice required'; END IF;
 WHEN 'PAYOUT' THEN
  IF NOT EXISTS(SELECT 1 FROM public.cash_registers WHERE id=(p_payload->>'target_id')::uuid AND entity_id=p_entity AND org_id=v_org AND currency=v_c.currency AND account_id<>v_c.clearing_account_id) THEN RAISE EXCEPTION 'matching bank register distinct from processor clearing required'; END IF;
 WHEN 'USAGE' THEN
  IF NOT EXISTS(SELECT 1 FROM public.finance_contracts WHERE id=(p_payload->>'target_id')::uuid AND entity_id=p_entity AND org_id=v_org AND terms->>'kind'='USAGE') THEN RAISE EXCEPTION 'matching usage contract required'; END IF;
 WHEN 'JOURNAL' THEN
  v_lines:=public.integration_journal_lines(v_org,v_i.source->'lines');
  PERFORM public.validate_finance_request(p_entity,'MANUAL_JOURNAL',jsonb_build_object('number','INTEGRATION-'||v_i.id,'date',v_i.source->>'date','memo','Imported source '||v_i.object_id,'lines',v_lines));
 ELSE RAISE EXCEPTION 'unsupported provider event must be reviewed and ignored';
 END CASE;
 RETURN p_payload;
END; $$;

CREATE OR REPLACE FUNCTION public.finance_source_snapshot(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_result jsonb;
BEGIN
 IF p_kind NOT IN ('INTEGRATION_APPLY','INTEGRATION_IGNORE','INTEGRATION_REVERSE') THEN RETURN public.contract_source_snapshot(p_entity,p_kind,p_payload); END IF;
 SELECT jsonb_build_object('connection',c.label,'provider_account',c.provider_account,'environment',c.environment,'connection_version',c.version,'clearing_account',c.clearing_account_id,
  'operation',i.operation,'object',i.object_id,'source',i.source,'state',i.state,'posting',i.result,'resolved_lines',CASE WHEN i.operation='JOURNAL' AND p_kind='INTEGRATION_APPLY' THEN public.integration_journal_lines(c.org_id,i.source->'lines') END)
 INTO v_result FROM public.finance_inbox i JOIN public.finance_connections c ON c.id=i.connection_id WHERE i.id=(p_payload->>'event_id')::uuid AND c.entity_id=p_entity AND c.org_id=public.get_user_org_id();
 IF v_result IS NULL THEN RAISE EXCEPTION 'integration source unavailable'; END IF;
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p jsonb:=p_request.payload;v_c public.finance_connections%ROWTYPE;v_i public.finance_inbox%ROWTYPE;
 v_cash uuid;v_id uuid;v_journal uuid;v_journals jsonb:='[]';v_result jsonb;v_date date;v_amount numeric;v_lines jsonb;v_j text;
BEGIN
 IF p_request.kind='INTEGRATION_CONFIG' THEN
  INSERT INTO public.finance_connections(id,org_id,entity_id,label,provider,provider_account,environment,currency,timezone,clearing_account_id,enabled,version,request_id)
   SELECT (v_p->>'id')::uuid,p_request.org_id,p_request.entity_id,v_p->>'label',v_p->>'provider',v_p->>'provider_account',v_p->>'environment',currency,v_p->>'timezone',(v_p->>'clearing_account_id')::uuid,(v_p->>'enabled')::boolean,1,p_request.id FROM public.entities WHERE id=p_request.entity_id
   ON CONFLICT(id) DO UPDATE SET label=excluded.label,enabled=excluded.enabled,version=public.finance_connections.version+1,request_id=excluded.request_id;
  RETURN jsonb_build_object('connectionId',v_p->>'id');
 ELSIF p_request.kind NOT IN ('INTEGRATION_APPLY','INTEGRATION_IGNORE','INTEGRATION_REVERSE') THEN RETURN public.execute_contract_extension(p_request); END IF;
 SELECT * INTO v_i FROM public.finance_inbox WHERE id=(v_p->>'event_id')::uuid AND org_id=p_request.org_id;
 SELECT * INTO v_c FROM public.finance_connections WHERE id=v_i.connection_id;
 IF p_request.kind='INTEGRATION_IGNORE' THEN
  UPDATE public.finance_inbox SET state='IGNORED',request_id=p_request.id WHERE id=v_i.id;RETURN jsonb_build_object('ignored',v_i.id);
 END IF;
 IF p_request.kind='INTEGRATION_REVERSE' THEN
  v_date:=(v_p->>'date')::date;
  IF v_i.result->>'receiptId' IS NOT NULL THEN
   v_id:=public.post_customer_receipt_correction((v_i.result->>'receiptId')::uuid,'INT-CORR-'||v_i.id,v_date,left(p_request.reason,240),'finance:'||p_request.id);
  END IF;
  FOR v_j IN SELECT jsonb_array_elements_text(v_i.result->'journals') LOOP
   v_journal:=public.reverse_posted_journal(v_j::uuid,v_date,left(p_request.reason,240),'finance:'||p_request.id||':'||v_j);
   v_journals:=v_journals||to_jsonb(v_journal::text);
  END LOOP;
  v_result:=jsonb_build_object('correctionId',v_id,'journals',v_journals);
  UPDATE public.finance_inbox SET state='REVERSED',reversal_request=p_request.id,reversal_result=v_result WHERE id=v_i.id;RETURN v_result;
 END IF;
 v_date:=(v_i.source->>'date')::date;
 IF v_i.operation IN ('RECEIPT','PAYOUT') THEN v_amount:=public.cash_amount(v_i.source->>'amount'); END IF;
 CASE v_i.operation
 WHEN 'RECEIPT' THEN
  v_id:=public.post_customer_receipt_amount((v_p->>'target_id')::uuid,'INT-RECEIPT-'||v_i.id,v_date,v_c.currency,v_i.object_id,'finance:'||p_request.id,v_amount);
  SELECT cash_account_id INTO v_cash FROM public.entity_customer_receipt_controls WHERE entity_id=p_request.entity_id;
  IF v_cash<>v_c.clearing_account_id THEN v_lines:=jsonb_build_array(jsonb_build_object('account_id',v_c.clearing_account_id,'debit',v_amount::text,'credit','0.00'),jsonb_build_object('account_id',v_cash,'debit','0.00','credit',v_amount::text)); END IF;
 WHEN 'PAYOUT' THEN
  SELECT account_id INTO v_cash FROM public.cash_registers WHERE id=(v_p->>'target_id')::uuid;
  v_lines:=jsonb_build_array(jsonb_build_object('account_id',v_cash,'debit',v_amount::text,'credit','0.00'),jsonb_build_object('account_id',v_c.clearing_account_id,'debit','0.00','credit',v_amount::text));
 WHEN 'USAGE' THEN v_id:=public.record_contract_usage((v_p->>'target_id')::uuid,'connection:'||v_c.id,v_i.object_id,(v_i.source->>'occurred_at')::timestamptz,v_i.source->>'units',NULL);
 WHEN 'JOURNAL' THEN v_lines:=public.integration_journal_lines(p_request.org_id,v_i.source->'lines');
 END CASE;
 IF v_lines IS NOT NULL THEN
  v_journal:=public.post_manual_journal(p_request.entity_id,'INTEGRATION-'||v_i.id,v_date,'Verified provider source '||v_i.object_id,v_lines,'finance:'||p_request.id||':journal');
  v_journals:=jsonb_build_array(v_journal);
 END IF;
 v_result:=jsonb_build_object('receiptId',CASE WHEN v_i.operation='RECEIPT' THEN v_id END,'usageId',CASE WHEN v_i.operation='USAGE' THEN v_id END,'journals',v_journals);
 UPDATE public.finance_inbox SET state='APPLIED',request_id=p_request.id,result=v_result WHERE id=v_i.id;
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.guard_integration_correction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_event uuid;v_request uuid:=nullif(current_setting('tapaano.finance_request',true),'')::uuid;
BEGIN
 IF TG_TABLE_NAME IN ('customer_receipt_corrections','customer_receipt_replacements') THEN
  SELECT id INTO v_event FROM public.finance_inbox WHERE result->>'receiptId'=NEW.original_receipt_id::text;
 ELSE
  SELECT id INTO v_event FROM public.finance_inbox WHERE result->'journals' ? NEW.reversal_of_id::text;
 END IF;
 IF v_event IS NOT NULL AND (TG_TABLE_NAME='customer_receipt_replacements' OR NOT EXISTS(SELECT 1 FROM public.finance_requests WHERE id=v_request AND kind='INTEGRATION_REVERSE' AND state='EXECUTING' AND payload->>'event_id'=v_event::text AND decided_by=auth.uid() AND requested_by<>auth.uid())) THEN RAISE EXCEPTION 'use the independently approved integration correction workflow and a fresh provider source for replacement'; END IF;
 RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS integration_receipt_correction ON public.customer_receipt_corrections;
CREATE TRIGGER integration_receipt_correction BEFORE INSERT ON public.customer_receipt_corrections FOR EACH ROW EXECUTE FUNCTION public.guard_integration_correction();
DROP TRIGGER IF EXISTS integration_receipt_replacement ON public.customer_receipt_replacements;
CREATE TRIGGER integration_receipt_replacement BEFORE INSERT ON public.customer_receipt_replacements FOR EACH ROW EXECUTE FUNCTION public.guard_integration_correction();
DROP TRIGGER IF EXISTS integration_journal_correction ON public.journal_entries;
CREATE TRIGGER integration_journal_correction BEFORE INSERT ON public.journal_entries FOR EACH ROW EXECUTE FUNCTION public.guard_integration_correction();

CREATE OR REPLACE FUNCTION public.validate_integration_graph(p_event uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_i public.finance_inbox%ROWTYPE;v_c public.finance_connections%ROWTYPE;v_r public.finance_requests%ROWTYPE;v_reverse public.finance_requests%ROWTYPE;
 v_receipt public.customer_receipts%ROWTYPE;v_j public.journal_entries%ROWTYPE;v_jid text;v_expected jsonb;v_actual jsonb;v_lines jsonb;v_cash uuid;v_amount numeric;v_usage public.finance_usage_events%ROWTYPE;
BEGIN
 SELECT * INTO v_i FROM public.finance_inbox WHERE id=p_event;
 IF v_i.id IS NULL THEN RAISE EXCEPTION 'integration evidence unavailable'; END IF;
 SELECT * INTO v_c FROM public.finance_connections WHERE id=v_i.connection_id AND org_id=v_i.org_id;
 IF v_i.state='RECEIVED' THEN
  IF v_i.request_id IS NOT NULL OR v_i.result IS NOT NULL OR v_i.reversal_request IS NOT NULL THEN RAISE EXCEPTION 'unreviewed source contains posting evidence'; END IF;
  RETURN;
 END IF;
 SELECT * INTO v_r FROM public.finance_requests WHERE id=v_i.request_id AND org_id=v_i.org_id AND entity_id=v_c.entity_id AND state='APPROVED' AND payload->>'event_id'=v_i.id::text;
 IF v_r.id IS NULL OR v_r.source_snapshot->'source' IS DISTINCT FROM v_i.source THEN RAISE EXCEPTION 'integration approval lineage mismatch'; END IF;
 IF v_i.state='IGNORED' THEN
  IF v_r.kind<>'INTEGRATION_IGNORE' OR v_i.result IS NOT NULL THEN RAISE EXCEPTION 'ignored integration has financial evidence'; END IF;RETURN;
 END IF;
 IF v_r.kind<>'INTEGRATION_APPLY' OR v_r.result IS DISTINCT FROM v_i.result THEN RAISE EXCEPTION 'integration posting result mismatch'; END IF;
 IF v_i.state='REVERSED' THEN
  SELECT * INTO v_reverse FROM public.finance_requests WHERE id=v_i.reversal_request AND org_id=v_i.org_id AND entity_id=v_c.entity_id AND state='APPROVED' AND kind='INTEGRATION_REVERSE' AND payload->>'event_id'=v_i.id::text;
  IF v_reverse.id IS NULL OR v_reverse.result IS DISTINCT FROM v_i.reversal_result THEN RAISE EXCEPTION 'integration correction lineage mismatch'; END IF;
 ELSIF v_i.reversal_request IS NOT NULL OR v_i.reversal_result IS NOT NULL THEN RAISE EXCEPTION 'integration correction state mismatch'; END IF;
 IF v_i.operation='USAGE' THEN
  SELECT * INTO v_usage FROM public.finance_usage_events WHERE id=(v_i.result->>'usageId')::uuid;
  IF v_usage.id IS NULL OR v_usage.contract_id IS DISTINCT FROM (v_r.payload->>'target_id')::uuid OR v_usage.source IS DISTINCT FROM 'connection:'||v_c.id OR v_usage.external_id IS DISTINCT FROM v_i.object_id OR v_usage.units IS DISTINCT FROM (v_i.source->>'units')::numeric OR v_usage.occurred_at IS DISTINCT FROM (v_i.source->>'occurred_at')::timestamptz THEN RAISE EXCEPTION 'integration usage lineage mismatch'; END IF;
  RETURN;
 END IF;
 IF v_i.operation IN ('RECEIPT','PAYOUT') THEN v_amount:=public.cash_amount(v_i.source->>'amount'); END IF;
 IF v_i.operation='RECEIPT' THEN
  SELECT * INTO v_receipt FROM public.customer_receipts WHERE id=(v_i.result->>'receiptId')::uuid;
  IF v_receipt.id IS NULL OR v_receipt.invoice_id IS DISTINCT FROM (v_r.payload->>'target_id')::uuid OR v_receipt.entity_id<>v_c.entity_id OR v_receipt.org_id<>v_c.org_id OR v_receipt.receipt_date IS DISTINCT FROM (v_i.source->>'date')::date OR v_receipt.amount IS DISTINCT FROM v_amount OR v_receipt.currency<>v_c.currency THEN RAISE EXCEPTION 'integration receipt lineage mismatch'; END IF;
  PERFORM public.validate_customer_receipt_graph(v_receipt.id);
  IF v_i.state='REVERSED' THEN
   IF NOT EXISTS(SELECT 1 FROM public.customer_receipt_corrections WHERE id=(v_i.reversal_result->>'correctionId')::uuid AND original_receipt_id=v_receipt.id AND correction_date=(v_reverse.payload->>'date')::date) THEN RAISE EXCEPTION 'integration receipt correction mismatch'; END IF;
  ELSIF EXISTS(SELECT 1 FROM public.customer_receipt_corrections WHERE original_receipt_id=v_receipt.id) THEN RAISE EXCEPTION 'integration receipt correction state mismatch'; END IF;
  SELECT cash_account_id INTO v_cash FROM public.entity_customer_receipt_controls WHERE entity_id=v_c.entity_id;
  IF v_cash<>v_c.clearing_account_id THEN v_lines:=jsonb_build_array(jsonb_build_object('account_id',v_c.clearing_account_id,'debit',v_amount::text,'credit','0.00'),jsonb_build_object('account_id',v_cash,'debit','0.00','credit',v_amount::text)); END IF;
 ELSIF v_i.operation='PAYOUT' THEN
  SELECT account_id INTO v_cash FROM public.cash_registers WHERE id=(v_r.payload->>'target_id')::uuid AND entity_id=v_c.entity_id AND org_id=v_c.org_id;
  IF v_cash IS NULL THEN RAISE EXCEPTION 'integration bank mapping unavailable'; END IF;
  v_lines:=jsonb_build_array(jsonb_build_object('account_id',v_cash,'debit',v_amount::text,'credit','0.00'),jsonb_build_object('account_id',v_c.clearing_account_id,'debit','0.00','credit',v_amount::text));
 ELSIF v_i.operation='JOURNAL' THEN v_lines:=v_r.source_snapshot->'resolved_lines';
 ELSE RAISE EXCEPTION 'unsupported source posted'; END IF;
 IF jsonb_typeof(v_i.result->'journals') IS DISTINCT FROM 'array' OR jsonb_array_length(v_i.result->'journals')<>(CASE WHEN v_lines IS NULL THEN 0 ELSE 1 END) THEN RAISE EXCEPTION 'integration journal count mismatch'; END IF;
 FOR v_jid IN SELECT jsonb_array_elements_text(v_i.result->'journals') LOOP
  SELECT * INTO v_j FROM public.journal_entries WHERE id=v_jid::uuid AND org_id=v_c.org_id AND entity_id=v_c.entity_id AND status='posted' AND source_module='gl';
  IF v_j.id IS NULL OR v_j.entry_date IS DISTINCT FROM (v_i.source->>'date')::date OR v_j.reversal_of_id IS NOT NULL OR NOT EXISTS(SELECT 1 FROM public.accounting_events WHERE id=v_j.accounting_event_id AND journal_entry_id=v_j.id AND idempotency_key='finance:'||v_r.id||':journal') THEN RAISE EXCEPTION 'integration journal lineage mismatch'; END IF;
  SELECT jsonb_agg(jsonb_build_array(account_id,debit::numeric,credit::numeric) ORDER BY account_id,debit,credit) INTO v_actual FROM public.journal_lines WHERE journal_entry_id=v_j.id;
  SELECT jsonb_agg(jsonb_build_array((value->>'account_id')::uuid,(value->>'debit')::numeric,(value->>'credit')::numeric) ORDER BY (value->>'account_id')::uuid,(value->>'debit')::numeric,(value->>'credit')::numeric) INTO v_expected FROM jsonb_array_elements(v_lines);
  IF v_actual IS DISTINCT FROM v_expected THEN RAISE EXCEPTION 'integration journal amount or account mismatch'; END IF;
  IF v_i.state='REVERSED' THEN
   IF v_j.reversed_by_id IS NULL OR NOT (v_i.reversal_result->'journals' ? v_j.reversed_by_id::text) OR NOT EXISTS(SELECT 1 FROM public.journal_entries WHERE id=v_j.reversed_by_id AND reversal_of_id=v_j.id AND entry_date=(v_reverse.payload->>'date')::date) THEN RAISE EXCEPTION 'integration journal correction mismatch'; END IF;
  ELSIF v_j.reversed_by_id IS NOT NULL THEN RAISE EXCEPTION 'integration journal was independently reversed'; END IF;
 END LOOP;
END; $$;
CREATE OR REPLACE FUNCTION public.check_integration_graph_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN PERFORM public.validate_integration_graph(NEW.id);RETURN NULL;END; $$;
DROP TRIGGER IF EXISTS integration_graph ON public.finance_inbox;
CREATE CONSTRAINT TRIGGER integration_graph AFTER INSERT OR UPDATE ON public.finance_inbox DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_integration_graph_trigger();

CREATE OR REPLACE FUNCTION public.get_finance_integration_report(p_entity uuid,p_as_of date,p_cursor uuid DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_id uuid;v_ids uuid[];v_cursor_time timestamptz;v_more boolean;v_events jsonb;v_controls jsonb;v_report jsonb;v_count bigint;
BEGIN
 IF auth.uid() IS NULL OR p_as_of IS NULL OR NOT EXISTS(SELECT 1 FROM public.entities WHERE id=p_entity AND org_id=v_org AND currency='USD') THEN RAISE EXCEPTION 'integration report unavailable for this entity or currency'; END IF;
 PERFORM public.get_entity_trial_balance(p_entity,DATE '0001-01-01',p_as_of);
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'page size must be between 1 and 500'; END IF;
 IF p_cursor IS NOT NULL THEN
  SELECT i.received_at INTO v_cursor_time FROM public.finance_inbox i JOIN public.finance_connections c ON c.id=i.connection_id WHERE i.id=p_cursor AND c.entity_id=p_entity AND c.org_id=v_org;
  IF v_cursor_time IS NULL THEN RAISE EXCEPTION 'integration page cursor unavailable'; END IF;
 END IF;
 SELECT count(*) INTO v_count FROM public.finance_inbox i JOIN public.finance_connections c ON c.id=i.connection_id WHERE c.entity_id=p_entity AND c.org_id=v_org;
 SELECT array_agg(id ORDER BY received_at DESC,id DESC) INTO v_ids FROM (SELECT i.id,i.received_at FROM public.finance_inbox i JOIN public.finance_connections c ON c.id=i.connection_id WHERE c.entity_id=p_entity AND c.org_id=v_org AND (p_cursor IS NULL OR (i.received_at,i.id)<(v_cursor_time,p_cursor)) ORDER BY i.received_at DESC,i.id DESC LIMIT p_limit+1) page;
 v_more:=coalesce(array_length(v_ids,1),0)>p_limit;v_ids:=v_ids[1:p_limit];
 FOR v_id IN SELECT unnest(v_ids) LOOP PERFORM public.validate_integration_graph(v_id); END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'connectionId',c.id,'connection',c.label,'operation',i.operation,'object',i.object_id,'state',i.state,'source',i.source,'receivedAt',i.received_at,'result',i.result,'reversal',i.reversal_result,'deliveries',(SELECT count(*) FROM public.finance_deliveries WHERE inbox_id=i.id)) ORDER BY i.received_at DESC,i.id DESC),'[]') INTO v_events FROM public.finance_inbox i JOIN public.finance_connections c ON c.id=i.connection_id WHERE i.id=ANY(v_ids);
 SELECT coalesce(jsonb_agg(jsonb_build_object('connectionId',c.id,'accountId',c.clearing_account_id,'balance',(SELECT round(coalesce(sum(l.debit-l.credit),0),2)::text FROM public.journal_lines l JOIN public.journal_entries j ON j.id=l.journal_entry_id WHERE j.entity_id=p_entity AND j.org_id=v_org AND j.status='posted' AND j.entry_date<=p_as_of AND l.account_id=c.clearing_account_id)) ORDER BY c.id),'[]') INTO v_controls FROM public.finance_connections c WHERE c.entity_id=p_entity AND c.org_id=v_org;
 v_report:=jsonb_build_object('entityId',p_entity,'asOf',p_as_of,'currency','USD','events',v_events,'controls',v_controls,'totalEvents',v_count,'nextCursor',CASE WHEN v_more THEN v_ids[p_limit] END);
 RETURN v_report||jsonb_build_object('revision',md5(v_report::text));
END; $$;

DO $$ DECLARE t text;f record; BEGIN
 FOREACH t IN ARRAY ARRAY['finance_connections','finance_inbox','finance_deliveries'] LOOP
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
  ('get_finance_connection','enqueue_finance_event','integration_journal_lines','guard_integration_correction','validate_integration_graph','check_integration_graph_trigger','get_finance_integration_report','validate_contract_extension','execute_contract_extension','contract_source_snapshot','validate_finance_extension','execute_finance_extension','finance_source_snapshot') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname IN ('get_finance_connection','enqueue_finance_event') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature); END IF;
  IF f.proname='get_finance_integration_report' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature); END IF;
 END LOOP;
END; $$;
COMMIT;
