BEGIN;
LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
 IF to_regprocedure('public.pre_bank_feed_validate(uuid,text,jsonb)') IS NULL THEN
  ALTER FUNCTION public.validate_finance_extension(uuid,text,jsonb) RENAME TO pre_bank_feed_validate;
  ALTER FUNCTION public.execute_finance_extension(public.finance_requests) RENAME TO pre_bank_feed_execute;
  ALTER FUNCTION public.finance_source_snapshot(uuid,text,jsonb) RENAME TO pre_bank_feed_snapshot;
  ALTER FUNCTION public.get_cash_reconciliation(uuid) RENAME TO pre_bank_feed_reconciliation;
  ALTER FUNCTION public.request_cash_review(uuid,text,text,text) RENAME TO pre_bank_feed_request_review;
  ALTER FUNCTION public.decide_cash_review(uuid,text,text) RENAME TO pre_bank_feed_decide_review;
  ALTER FUNCTION public.get_finance_close_check(uuid,date,date) RENAME TO pre_bank_feed_close_check;
 END IF;
END; $$;

CREATE TABLE IF NOT EXISTS public.finance_bank_feeds (
 id uuid PRIMARY KEY,org_id uuid NOT NULL,entity_id uuid NOT NULL,register_id uuid NOT NULL,
 label text NOT NULL,provider text NOT NULL DEFAULT 'PLAID' CHECK(provider='PLAID'),
 environment text NOT NULL CHECK(environment IN ('SANDBOX','PRODUCTION')),item_id text NOT NULL,account_id text NOT NULL,
 coverage_start date NOT NULL CHECK(coverage_start BETWEEN DATE '0001-01-02' AND DATE '9999-12-31'),
 enabled boolean NOT NULL,version integer NOT NULL CHECK(version>0),request_id uuid NOT NULL,
 UNIQUE(org_id,id),UNIQUE(environment,item_id,account_id),
 FOREIGN KEY(org_id,entity_id) REFERENCES public.entities(org_id,id),
 FOREIGN KEY(org_id,register_id) REFERENCES public.cash_registers(org_id,id),
 FOREIGN KEY(org_id,request_id) REFERENCES public.finance_requests(org_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_feed_active_register ON public.finance_bank_feeds(register_id) WHERE enabled;
CREATE TABLE IF NOT EXISTS public.finance_bank_sync_state (
 feed_id uuid PRIMARY KEY,org_id uuid NOT NULL,cursor text,generation integer NOT NULL DEFAULT 0,
 update_status text NOT NULL DEFAULT 'NOT_READY',last_run uuid,active_run uuid,lease_token uuid,lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),last_success_at timestamptz,last_error text,failures integer NOT NULL DEFAULT 0,
 FOREIGN KEY(org_id,feed_id) REFERENCES public.finance_bank_feeds(org_id,id),CHECK(generation>=0 AND failures>=0)
);
CREATE TABLE IF NOT EXISTS public.finance_bank_sync_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,feed_id uuid NOT NULL,feed_version integer NOT NULL,
 generation integer NOT NULL,origin_cursor text,next_cursor text,page_count integer NOT NULL DEFAULT 0,
 state text NOT NULL CHECK(state IN ('ACTIVE','COMMITTED','ABANDONED')),started_at timestamptz NOT NULL DEFAULT now(),finished_at timestamptz,error_code text,
 UNIQUE(org_id,id),FOREIGN KEY(org_id,feed_id) REFERENCES public.finance_bank_feeds(org_id,id)
);
CREATE UNIQUE INDEX IF NOT EXISTS bank_feed_committed_generation ON public.finance_bank_sync_runs(feed_id,generation) WHERE state='COMMITTED';
CREATE TABLE IF NOT EXISTS public.finance_bank_sync_pages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,run_id uuid NOT NULL,page_number integer NOT NULL,
 cursor text,lease_token uuid NOT NULL,payload jsonb NOT NULL,body_sha256 text NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(org_id,id),UNIQUE(run_id,page_number),FOREIGN KEY(org_id,run_id) REFERENCES public.finance_bank_sync_runs(org_id,id),
 CHECK(page_number BETWEEN 0 AND 999),CHECK(body_sha256 ~ '^[a-f0-9]{64}$')
);
CREATE TABLE IF NOT EXISTS public.finance_bank_transactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,feed_id uuid NOT NULL,external_id text NOT NULL,
 payload jsonb NOT NULL,revision integer NOT NULL,last_run uuid NOT NULL,
 UNIQUE(org_id,id),UNIQUE(feed_id,external_id),FOREIGN KEY(org_id,feed_id) REFERENCES public.finance_bank_feeds(org_id,id),
 FOREIGN KEY(org_id,last_run) REFERENCES public.finance_bank_sync_runs(org_id,id),CHECK(revision>0)
);
CREATE TABLE IF NOT EXISTS public.finance_bank_transaction_revisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,transaction_id uuid NOT NULL,revision integer NOT NULL,
 run_id uuid NOT NULL,page_id uuid NOT NULL,operation text NOT NULL CHECK(operation IN ('added','modified','removed')),
 payload jsonb NOT NULL,UNIQUE(transaction_id,revision),
 FOREIGN KEY(org_id,transaction_id) REFERENCES public.finance_bank_transactions(org_id,id),
 FOREIGN KEY(org_id,run_id) REFERENCES public.finance_bank_sync_runs(org_id,id),FOREIGN KEY(org_id,page_id) REFERENCES public.finance_bank_sync_pages(org_id,id)
);
CREATE TABLE IF NOT EXISTS public.finance_bank_feed_statements (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),org_id uuid NOT NULL,feed_id uuid NOT NULL,statement_id uuid NOT NULL,
 generation integer NOT NULL,sources jsonb NOT NULL,evidence text NOT NULL,created_by uuid NOT NULL REFERENCES auth.users(id),
 UNIQUE(org_id,id),UNIQUE(statement_id),FOREIGN KEY(org_id,feed_id) REFERENCES public.finance_bank_feeds(org_id,id),
 FOREIGN KEY(org_id,statement_id) REFERENCES public.cash_statements(org_id,id)
);
CREATE INDEX IF NOT EXISTS bank_feed_transaction_dates ON public.finance_bank_transactions(feed_id,(payload->>'date'),external_id);
CREATE INDEX IF NOT EXISTS bank_feed_runs ON public.finance_bank_sync_runs(feed_id,generation);

CREATE OR REPLACE FUNCTION public.validate_finance_extension(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_f public.finance_bank_feeds%ROWTYPE;
BEGIN
 IF p_kind<>'BANK_FEED_CONFIG' THEN RETURN public.pre_bank_feed_validate(p_entity,p_kind,p_payload);END IF;
 IF NOT public.has_role(auth.uid(),'admin') THEN RAISE EXCEPTION 'bank feed configuration requires an administrator';END IF;
 IF p_payload-ARRAY['id','register_id','label','environment','item_id','account_id','coverage_start','enabled','expected_version']<>'{}'::jsonb OR
  length(coalesce(p_payload->>'label','')) NOT BETWEEN 1 AND 100 OR coalesce(p_payload->>'environment','') NOT IN ('SANDBOX','PRODUCTION') OR
  length(coalesce(p_payload->>'item_id','')) NOT BETWEEN 1 AND 150 OR length(coalesce(p_payload->>'account_id','')) NOT BETWEEN 1 AND 150 OR
  jsonb_typeof(p_payload->'enabled') IS DISTINCT FROM 'boolean' OR coalesce(p_payload->>'expected_version','') !~ '^[0-9]{1,8}$' OR
  coalesce(p_payload->>'coverage_start','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (p_payload->>'coverage_start')::date NOT BETWEEN DATE '0001-01-02' AND CURRENT_DATE THEN RAISE EXCEPTION 'invalid bank feed configuration';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.cash_registers r JOIN public.entities e ON e.id=r.entity_id JOIN public.accounts a ON a.id=r.account_id WHERE r.id=(p_payload->>'register_id')::uuid AND r.org_id=v_org AND r.entity_id=p_entity AND r.currency='USD' AND e.currency=r.currency AND a.is_active AND a.account_type='asset') THEN RAISE EXCEPTION 'bank feed requires an active USD cash register';END IF;
 IF (p_payload->>'id')::uuid IS NULL THEN RAISE EXCEPTION 'bank feed identity required';END IF;
 SELECT * INTO v_f FROM public.finance_bank_feeds WHERE id=(p_payload->>'id')::uuid;
 IF coalesce(v_f.version,0)<>(p_payload->>'expected_version')::int THEN RAISE EXCEPTION 'bank feed configuration changed';END IF;
 IF v_f.id IS NOT NULL AND (v_f.org_id<>v_org OR v_f.entity_id<>p_entity OR v_f.register_id<>(p_payload->>'register_id')::uuid OR v_f.environment<>p_payload->>'environment' OR v_f.item_id<>p_payload->>'item_id' OR v_f.account_id<>p_payload->>'account_id' OR v_f.coverage_start<>(p_payload->>'coverage_start')::date) THEN RAISE EXCEPTION 'bank feed identity and coverage are immutable';END IF;
 RETURN p_payload;
END; $$;
CREATE OR REPLACE FUNCTION public.finance_source_snapshot(p_entity uuid,p_kind text,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_kind='BANK_FEED_CONFIG' THEN RETURN jsonb_build_object('existing',(SELECT to_jsonb(f) FROM public.finance_bank_feeds f WHERE id=(p_payload->>'id')::uuid),'register',(SELECT to_jsonb(r) FROM public.cash_registers r WHERE id=(p_payload->>'register_id')::uuid AND entity_id=p_entity AND org_id=public.get_user_org_id()));END IF;
 RETURN public.pre_bank_feed_snapshot(p_entity,p_kind,p_payload);
END; $$;
CREATE OR REPLACE FUNCTION public.execute_finance_extension(p_request public.finance_requests)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_p jsonb:=p_request.payload;v_id uuid;
BEGIN
 IF p_request.kind<>'BANK_FEED_CONFIG' THEN RETURN public.pre_bank_feed_execute(p_request);END IF;
 v_id:=(v_p->>'id')::uuid;
 INSERT INTO public.finance_bank_feeds(id,org_id,entity_id,register_id,label,environment,item_id,account_id,coverage_start,enabled,version,request_id)
 VALUES(v_id,p_request.org_id,p_request.entity_id,(v_p->>'register_id')::uuid,v_p->>'label',v_p->>'environment',v_p->>'item_id',v_p->>'account_id',(v_p->>'coverage_start')::date,(v_p->>'enabled')::boolean,(v_p->>'expected_version')::int+1,p_request.id)
 ON CONFLICT(id) DO UPDATE SET label=excluded.label,enabled=excluded.enabled,version=excluded.version,request_id=excluded.request_id;
 INSERT INTO public.finance_bank_sync_state(feed_id,org_id) VALUES(v_id,p_request.org_id) ON CONFLICT(feed_id) DO UPDATE SET next_attempt_at=now();
 RETURN jsonb_build_object('feedId',v_id,'version',(v_p->>'expected_version')::int+1);
END; $$;

-- The worker receives only identities/cursors. Credentials stay in deployment secrets.
CREATE OR REPLACE FUNCTION public.claim_bank_feed_sync(p_feed uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_f public.finance_bank_feeds%ROWTYPE;v_s public.finance_bank_sync_state%ROWTYPE;v_r public.finance_bank_sync_runs%ROWTYPE;v_token uuid:=gen_random_uuid();
BEGIN
 LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
 SELECT s.* INTO v_s FROM public.finance_bank_sync_state s JOIN public.finance_bank_feeds f ON f.id=s.feed_id WHERE f.enabled AND (p_feed IS NULL OR f.id=p_feed) AND s.next_attempt_at<=now() AND (s.lease_until IS NULL OR s.lease_until<=now()) ORDER BY s.next_attempt_at,f.id LIMIT 1 FOR UPDATE OF s SKIP LOCKED;
 IF v_s.feed_id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO v_f FROM public.finance_bank_feeds WHERE id=v_s.feed_id;
 PERFORM public.validate_bank_feed_graph(v_f.id);
 PERFORM set_config('tapaano.accounting_write','trusted',true);
 SELECT * INTO v_r FROM public.finance_bank_sync_runs WHERE id=v_s.active_run AND state='ACTIVE';
 IF v_r.id IS NOT NULL AND (v_s.lease_token IS NOT NULL OR v_r.feed_version<>v_f.version) THEN
  UPDATE public.finance_bank_sync_runs SET state='ABANDONED',finished_at=now(),error_code='INTERRUPTED' WHERE id=v_r.id;v_r.id:=NULL;
 END IF;
 IF v_r.id IS NULL THEN
  INSERT INTO public.finance_bank_sync_runs(org_id,feed_id,feed_version,generation,origin_cursor,next_cursor,state) VALUES(v_f.org_id,v_f.id,v_f.version,v_s.generation+1,v_s.cursor,v_s.cursor,'ACTIVE') RETURNING * INTO v_r;
 END IF;
 UPDATE public.finance_bank_sync_state SET active_run=v_r.id,lease_token=v_token,lease_until=now()+INTERVAL '5 minutes' WHERE feed_id=v_f.id;
 RETURN jsonb_build_object('feedId',v_f.id,'runId',v_r.id,'leaseToken',v_token,'environment',v_f.environment,'itemId',v_f.item_id,'accountId',v_f.account_id,'cursor',v_r.next_cursor,'pageNumber',v_r.page_count);
END; $$;

CREATE OR REPLACE FUNCTION public.validate_bank_feed_page(p_feed uuid,p_page jsonb)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_f public.finance_bank_feeds%ROWTYPE;v_op text;v_t jsonb;
BEGIN
 SELECT * INTO v_f FROM public.finance_bank_feeds WHERE id=p_feed;
 IF jsonb_typeof(p_page) IS DISTINCT FROM 'object' OR octet_length(p_page::text)>1500000 OR p_page-ARRAY['requestId','nextCursor','hasMore','updateStatus','added','modified','removed']<>'{}'::jsonb OR
  length(coalesce(p_page->>'requestId','')) NOT BETWEEN 1 AND 200 OR jsonb_typeof(p_page->'nextCursor') IS DISTINCT FROM 'string' OR length(p_page->>'nextCursor')>256 OR p_page->>'nextCursor'='now' OR jsonb_typeof(p_page->'hasMore') IS DISTINCT FROM 'boolean' OR
  coalesce(p_page->>'updateStatus','') NOT IN ('NOT_READY','INITIAL_UPDATE_COMPLETE','HISTORICAL_UPDATE_COMPLETE','TRANSACTIONS_UPDATE_STATUS_UNKNOWN') THEN RAISE EXCEPTION 'invalid normalized bank feed page';END IF;
 FOREACH v_op IN ARRAY ARRAY['added','modified','removed'] LOOP
  IF jsonb_typeof(p_page->v_op) IS DISTINCT FROM 'array' OR jsonb_array_length(p_page->v_op)>500 THEN RAISE EXCEPTION 'invalid bank feed page size';END IF;
  FOR v_t IN SELECT value FROM jsonb_array_elements(p_page->v_op) LOOP
   IF jsonb_typeof(v_t) IS DISTINCT FROM 'object' OR jsonb_typeof(v_t->'externalId') IS DISTINCT FROM 'string' OR length(coalesce(v_t->>'externalId','')) NOT BETWEEN 1 AND 150 OR v_t->>'accountId' IS DISTINCT FROM v_f.account_id THEN RAISE EXCEPTION 'bank transaction identity differs from approved account';END IF;
   IF v_op='removed' THEN
    IF v_t-ARRAY['externalId','accountId','state']<>'{}'::jsonb OR v_t->>'state' IS DISTINCT FROM 'REMOVED' THEN RAISE EXCEPTION 'invalid bank removal';END IF;
   ELSE
    IF v_t-ARRAY['externalId','accountId','currency','date','description','amount','state','pendingId']<>'{}'::jsonb OR v_t->>'currency' IS DISTINCT FROM 'USD' OR
     coalesce(v_t->>'state','') NOT IN ('PENDING','POSTED') OR jsonb_typeof(v_t->'description') IS DISTINCT FROM 'string' OR length(v_t->>'description')>500 OR
     jsonb_typeof(v_t->'amount') IS DISTINCT FROM 'string' OR coalesce(v_t->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (v_t->>'date')::date NOT BETWEEN DATE '0001-01-02' AND DATE '9999-12-31' OR length(coalesce(v_t->>'pendingId',''))>150 THEN RAISE EXCEPTION 'invalid exact bank transaction';END IF;
    PERFORM public.cash_amount(v_t->>'amount');
   END IF;
  END LOOP;
 END LOOP;
 IF p_page->>'nextCursor'='' AND ((p_page->>'hasMore')::boolean OR p_page->>'updateStatus'='HISTORICAL_UPDATE_COMPLETE' OR jsonb_array_length(p_page->'added')+jsonb_array_length(p_page->'modified')+jsonb_array_length(p_page->'removed')>0) THEN RAISE EXCEPTION 'empty bank cursor requires an incomplete empty initial response';END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.append_bank_feed_page(p_run uuid,p_token uuid,p_number integer,p_cursor text,p_page jsonb,p_body_sha256 text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_r public.finance_bank_sync_runs%ROWTYPE;v_s public.finance_bank_sync_state%ROWTYPE;v_f public.finance_bank_feeds%ROWTYPE;v_old public.finance_bank_sync_pages%ROWTYPE;
 v_page public.finance_bank_sync_pages%ROWTYPE;v_t public.finance_bank_transactions%ROWTYPE;v_op text;v_data jsonb;
BEGIN
 LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO v_r FROM public.finance_bank_sync_runs WHERE id=p_run;
 IF v_r.id IS NULL THEN RAISE EXCEPTION 'bank sync run unavailable';END IF;
 SELECT * INTO v_old FROM public.finance_bank_sync_pages WHERE run_id=p_run AND page_number=p_number;
 IF v_old.id IS NOT NULL THEN
  IF v_old.payload IS DISTINCT FROM p_page OR v_old.cursor IS DISTINCT FROM p_cursor OR v_old.body_sha256 IS DISTINCT FROM p_body_sha256 OR v_old.lease_token IS DISTINCT FROM p_token THEN RAISE EXCEPTION 'bank page idempotency conflict';END IF;
  RETURN jsonb_build_object('committed',v_r.state='COMMITTED','nextCursor',p_page->>'nextCursor','pageNumber',p_number+1);
 END IF;
 SELECT * INTO v_s FROM public.finance_bank_sync_state WHERE feed_id=v_r.feed_id FOR UPDATE;
 SELECT * INTO v_f FROM public.finance_bank_feeds WHERE id=v_r.feed_id;
 IF v_r.state<>'ACTIVE' OR v_s.active_run IS DISTINCT FROM p_run OR v_s.lease_token IS DISTINCT FROM p_token OR v_s.lease_until<=now() OR NOT v_f.enabled OR v_f.version<>v_r.feed_version OR
  v_r.generation<>v_s.generation+1 OR v_r.origin_cursor IS DISTINCT FROM v_s.cursor OR p_number IS DISTINCT FROM v_r.page_count OR p_number>=1000 OR v_r.next_cursor IS DISTINCT FROM p_cursor OR coalesce(p_body_sha256,'') !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'bank sync lease, cursor or configuration changed';END IF;
 PERFORM public.validate_bank_feed_page(v_f.id,p_page);
 IF (p_page->>'hasMore')::boolean AND (p_page->>'nextCursor' IS NOT DISTINCT FROM p_cursor OR EXISTS(SELECT 1 FROM public.finance_bank_sync_pages WHERE run_id=p_run AND payload->>'nextCursor'=p_page->>'nextCursor')) THEN RAISE EXCEPTION 'bank pagination did not advance';END IF;
 PERFORM set_config('tapaano.accounting_write','trusted',true);
 INSERT INTO public.finance_bank_sync_pages(org_id,run_id,page_number,cursor,lease_token,payload,body_sha256) VALUES(v_r.org_id,p_run,p_number,p_cursor,p_token,p_page,p_body_sha256);
 UPDATE public.finance_bank_sync_runs SET page_count=page_count+1,next_cursor=p_page->>'nextCursor' WHERE id=p_run;
 IF (p_page->>'hasMore')::boolean THEN RETURN jsonb_build_object('committed',false,'nextCursor',p_page->>'nextCursor','pageNumber',p_number+1);END IF;
 -- Apply complete added/modified/removed sets only after the last page is durable.
 UPDATE public.finance_bank_sync_runs SET state='COMMITTED',finished_at=now() WHERE id=p_run;
 FOREACH v_op IN ARRAY ARRAY['added','modified','removed'] LOOP
  FOR v_page IN SELECT * FROM public.finance_bank_sync_pages WHERE run_id=p_run ORDER BY page_number LOOP
   FOR v_data IN SELECT value FROM jsonb_array_elements(v_page.payload->v_op) LOOP
    SELECT * INTO v_t FROM public.finance_bank_transactions WHERE feed_id=v_f.id AND external_id=v_data->>'externalId';
    IF v_t.id IS NOT NULL AND v_t.payload=v_data THEN CONTINUE;END IF;
    INSERT INTO public.finance_bank_transactions(org_id,feed_id,external_id,payload,revision,last_run) VALUES(v_f.org_id,v_f.id,v_data->>'externalId',v_data,1,p_run)
     ON CONFLICT(feed_id,external_id) DO UPDATE SET payload=excluded.payload,revision=finance_bank_transactions.revision+1,last_run=p_run RETURNING * INTO v_t;
    INSERT INTO public.finance_bank_transaction_revisions(org_id,transaction_id,revision,run_id,page_id,operation,payload) VALUES(v_f.org_id,v_t.id,v_t.revision,p_run,v_page.id,v_op,v_data);
   END LOOP;
  END LOOP;
 END LOOP;
 UPDATE public.finance_bank_sync_state SET cursor=p_page->>'nextCursor',generation=v_r.generation,update_status=p_page->>'updateStatus',last_run=p_run,active_run=NULL,lease_token=NULL,lease_until=NULL,
  next_attempt_at=now()+INTERVAL '15 minutes',last_success_at=now(),last_error=NULL,failures=0 WHERE feed_id=v_f.id;
 RETURN jsonb_build_object('committed',true,'nextCursor',p_page->>'nextCursor','pageNumber',p_number+1);
END; $$;

CREATE OR REPLACE FUNCTION public.release_bank_feed_sync(p_run uuid,p_token uuid,p_error text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_s public.finance_bank_sync_state%ROWTYPE;
BEGIN
 SELECT * INTO v_s FROM public.finance_bank_sync_state WHERE active_run=p_run AND lease_token=p_token FOR UPDATE;
 IF v_s.feed_id IS NULL THEN RETURN;END IF;
 IF p_error IS NOT NULL AND p_error NOT IN ('AUTH_REQUIRED','PROVIDER_UNAVAILABLE','RATE_LIMITED','CURSOR_MUTATION','INVALID_SOURCE','CONFIGURATION','INTERRUPTED','DATABASE_UNAVAILABLE') THEN RAISE EXCEPTION 'invalid bank worker failure';END IF;
 PERFORM set_config('tapaano.accounting_write','trusted',true);
 IF p_error IS NOT NULL THEN UPDATE public.finance_bank_sync_runs SET state='ABANDONED',finished_at=now(),error_code=p_error WHERE id=p_run AND state='ACTIVE';END IF;
 UPDATE public.finance_bank_sync_state SET lease_token=NULL,lease_until=NULL,active_run=CASE WHEN p_error IS NULL THEN active_run ELSE NULL END,
  last_error=p_error,failures=CASE WHEN p_error IS NULL THEN failures ELSE failures+1 END,
  next_attempt_at=now()+make_interval(secs=>CASE WHEN p_error IS NULL THEN 0 ELSE least(3600,30*power(2,least(failures,7))::int) END) WHERE feed_id=v_s.feed_id;
END; $$;
CREATE OR REPLACE FUNCTION public.request_bank_feed_sync(p_feed uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.assert_accounting_actor(public.get_user_org_id());
 IF NOT EXISTS(SELECT 1 FROM public.finance_bank_feeds WHERE id=p_feed AND org_id=public.get_user_org_id() AND enabled) THEN RAISE EXCEPTION 'bank feed unavailable';END IF;
 PERFORM set_config('tapaano.accounting_write','trusted',true);
 UPDATE public.finance_bank_sync_state SET next_attempt_at=least(next_attempt_at,greatest(now(),coalesce(last_success_at,now()-INTERVAL '1 minute')+INTERVAL '1 minute')) WHERE feed_id=p_feed;
END; $$;

CREATE OR REPLACE FUNCTION public.bank_feed_window(p_feed uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'payload',payload) ORDER BY external_id),'[]'::jsonb)
 FROM public.finance_bank_transactions WHERE feed_id=p_feed AND payload->>'state'='POSTED' AND (payload->>'date')::date BETWEEN p_from AND p_through AND (payload->>'amount')::numeric<>0
$$;
CREATE OR REPLACE FUNCTION public.bank_feed_ready(p_feed uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce((SELECT f.enabled AND s.update_status='HISTORICAL_UPDATE_COMPLETE' AND s.last_success_at>=now()-INTERVAL '24 hours' AND s.active_run IS NULL AND s.last_error IS NULL
  FROM public.finance_bank_feeds f JOIN public.finance_bank_sync_state s ON s.feed_id=f.id WHERE f.id=p_feed),false)
$$;
CREATE OR REPLACE FUNCTION public.bank_feed_statement_source(p_statement uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_b public.finance_bank_feed_statements%ROWTYPE;v_s public.cash_statements%ROWTYPE;v_current jsonb;v_f public.finance_bank_feeds%ROWTYPE;
BEGIN
 SELECT * INTO v_b FROM public.finance_bank_feed_statements WHERE statement_id=p_statement;
 IF v_b.id IS NULL THEN RETURN NULL;END IF;
 PERFORM public.validate_bank_feed_graph(v_b.feed_id);
 PERFORM public.validate_bank_feed_statement_graph(v_b.id);
 SELECT * INTO v_s FROM public.cash_statements WHERE id=p_statement;SELECT * INTO v_f FROM public.finance_bank_feeds WHERE id=v_b.feed_id;
 v_current:=public.bank_feed_window(v_b.feed_id,v_s.starts_on,v_s.ends_on);
 RETURN jsonb_build_object('feedId',v_b.feed_id,'label',v_f.label,'importGeneration',v_b.generation,'changed',v_current IS DISTINCT FROM v_b.sources,'ready',public.bank_feed_ready(v_b.feed_id),'currentRevision',md5(v_current::text),'evidence',v_b.evidence);
END; $$;
CREATE OR REPLACE FUNCTION public.import_bank_feed_statement(p_feed uuid,p_statement jsonb,p_revision text,p_evidence text,p_key text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_org uuid:=public.get_user_org_id();v_f public.finance_bank_feeds%ROWTYPE;v_s public.finance_bank_sync_state%ROWTYPE;v_sources jsonb;v_payload jsonb;v_id uuid;v_old public.cash_statements%ROWTYPE;v_binding public.finance_bank_feed_statements%ROWTYPE;
BEGIN
 PERFORM public.assert_accounting_actor(v_org);
 LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO v_f FROM public.finance_bank_feeds WHERE id=p_feed AND org_id=v_org;
 IF v_f.id IS NULL THEN RAISE EXCEPTION 'bank feed unavailable';END IF;
 IF jsonb_typeof(p_statement) IS DISTINCT FROM 'object' OR p_statement-ARRAY['reference','starts_on','ends_on','opening','closing']<>'{}'::jsonb OR length(coalesce(p_evidence,'')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'bank statement controls and source evidence required';END IF;
 SELECT * INTO v_old FROM public.cash_statements WHERE org_id=v_org AND request_key=p_key;
 IF v_old.id IS NOT NULL THEN
  SELECT * INTO v_binding FROM public.finance_bank_feed_statements WHERE statement_id=v_old.id;
  IF v_binding.feed_id IS DISTINCT FROM p_feed OR v_binding.evidence IS DISTINCT FROM p_evidence OR v_old.payload-'lines' IS DISTINCT FROM p_statement OR md5(v_binding.sources::text) IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'bank statement idempotency conflict';END IF;
  RETURN v_old.id;
 END IF;
 PERFORM public.validate_bank_feed_graph(p_feed);
 SELECT * INTO v_s FROM public.finance_bank_sync_state WHERE feed_id=p_feed;
 IF NOT v_f.enabled OR v_s.update_status<>'HISTORICAL_UPDATE_COMPLETE' OR v_s.last_success_at IS NULL OR v_s.last_success_at<now()-INTERVAL '24 hours' OR v_s.active_run IS NOT NULL OR v_s.last_error IS NOT NULL THEN RAISE EXCEPTION 'complete a healthy bank sync before importing a statement';END IF;
 IF coalesce(p_statement->>'starts_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR coalesce(p_statement->>'ends_on','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' OR (p_statement->>'starts_on')::date<v_f.coverage_start OR (p_statement->>'ends_on')::date>CURRENT_DATE THEN RAISE EXCEPTION 'statement is outside reviewed bank coverage';END IF;
 v_sources:=public.bank_feed_window(p_feed,(p_statement->>'starts_on')::date,(p_statement->>'ends_on')::date);
 IF md5(v_sources::text) IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'bank transactions changed; refresh the statement preview';END IF;
 IF jsonb_array_length(v_sources)>5000 THEN RAISE EXCEPTION 'bank statement exceeds 5000 posted lines; use a shorter bank statement period';END IF;
 v_payload:=p_statement||jsonb_build_object('lines',coalesce((SELECT jsonb_agg(jsonb_build_object('external_id',x->'payload'->>'externalId','booked_on',x->'payload'->>'date','description',x->'payload'->>'description','reference','Plaid verified transaction','amount',x->'payload'->>'amount') ORDER BY x->'payload'->>'externalId') FROM jsonb_array_elements(v_sources) x),'[]'::jsonb));
 v_id:=public.import_cash_statement(v_f.register_id,v_payload,p_key);
 INSERT INTO public.finance_bank_feed_statements(org_id,feed_id,statement_id,generation,sources,evidence,created_by) VALUES(v_org,p_feed,v_id,v_s.generation,v_sources,p_evidence,auth.uid());
 RETURN v_id;
END; $$;

CREATE OR REPLACE FUNCTION public.get_cash_reconciliation(p_statement_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_r jsonb;
BEGIN
 v_r:=public.pre_bank_feed_reconciliation(p_statement_id)-'revision';
 v_r:=v_r||jsonb_build_object('bankFeed',public.bank_feed_statement_source(p_statement_id));
 RETURN v_r||jsonb_build_object('revision',md5(v_r::text));
END; $$;
CREATE OR REPLACE FUNCTION public.request_cash_review(p_statement_id uuid,p_action text,p_reason text,p_revision text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_r jsonb;
BEGIN
 LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
 v_r:=public.get_cash_reconciliation(p_statement_id);
 IF p_action='CLOSE' AND coalesce((v_r->'bankFeed'->>'changed')::boolean,false) THEN RAISE EXCEPTION 'bank provider changed statement sources; void and rebuild the statement before close';END IF;
 IF p_action='CLOSE' AND v_r->'bankFeed'<>'null'::jsonb AND NOT (v_r->'bankFeed'->>'ready')::boolean THEN RAISE EXCEPTION 'complete a healthy bank sync before closing the statement';END IF;
 RETURN public.pre_bank_feed_request_review(p_statement_id,p_action,p_reason,p_revision);
END; $$;
CREATE OR REPLACE FUNCTION public.decide_cash_review(p_review_id uuid,p_decision text,p_reason text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_r public.cash_reviews%ROWTYPE;v_source jsonb;
BEGIN
 LOCK TABLE public.journal_entries IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO v_r FROM public.cash_reviews WHERE id=p_review_id AND org_id=public.get_user_org_id();
 IF v_r.decision IS NULL AND v_r.action='CLOSE' AND p_decision='APPROVE' THEN
  v_source:=public.bank_feed_statement_source(v_r.statement_id);
  IF coalesce((v_source->>'changed')::boolean,false) THEN RAISE EXCEPTION 'bank provider changed statement sources; reject and rebuild the statement';END IF;
  IF v_source IS NOT NULL AND NOT (v_source->>'ready')::boolean THEN RAISE EXCEPTION 'complete a healthy bank sync before approving the statement';END IF;
 END IF;
 PERFORM public.pre_bank_feed_decide_review(p_review_id,p_decision,p_reason);
END; $$;
CREATE OR REPLACE FUNCTION public.get_finance_close_check(p_entity uuid,p_from date,p_through date)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_r jsonb;v_conflicts integer;v_unavailable integer;v_id uuid;
BEGIN
 v_r:=public.pre_bank_feed_close_check(p_entity,p_from,p_through)-'revision'-'generatedAt';
 FOR v_id IN SELECT id FROM public.finance_bank_feeds WHERE entity_id=p_entity LOOP PERFORM public.validate_bank_feed_graph(v_id);END LOOP;
 SELECT count(*) INTO v_conflicts FROM public.finance_bank_feed_statements b JOIN public.cash_statements s ON s.id=b.statement_id JOIN public.finance_bank_feeds f ON f.id=b.feed_id
  WHERE f.entity_id=p_entity AND s.status<>'VOID' AND s.starts_on<=p_through AND (public.bank_feed_statement_source(s.id)->>'changed')::boolean;
 SELECT count(*) INTO v_unavailable FROM public.finance_bank_feeds WHERE entity_id=p_entity AND enabled AND coverage_start<=p_through AND NOT public.bank_feed_ready(id);
 v_r:=v_r||jsonb_build_object('bankFeedConflicts',v_conflicts,'bankFeedUnavailable',v_unavailable,'canClose',(v_r->>'canClose')::boolean AND v_conflicts=0 AND v_unavailable=0);
 RETURN v_r||jsonb_build_object('revision',md5(v_r::text),'generatedAt',now());
END; $$;

CREATE OR REPLACE FUNCTION public.validate_bank_feed_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_f public.finance_bank_feeds%ROWTYPE;v_q public.finance_requests%ROWTYPE;v_s public.finance_bank_sync_state%ROWTYPE;v_r public.finance_bank_sync_runs%ROWTYPE;
BEGIN
 SELECT * INTO v_f FROM public.finance_bank_feeds WHERE id=p_id;SELECT * INTO v_q FROM public.finance_requests WHERE id=v_f.request_id;SELECT * INTO v_s FROM public.finance_bank_sync_state WHERE feed_id=p_id;
 IF v_f.id IS NULL OR v_s.feed_id IS NULL OR v_s.org_id<>v_f.org_id OR v_q.org_id IS DISTINCT FROM v_f.org_id OR v_q.entity_id IS DISTINCT FROM v_f.entity_id OR v_q.kind IS DISTINCT FROM 'BANK_FEED_CONFIG' OR v_q.state NOT IN ('APPROVED','EXECUTING') OR v_q.requested_by=v_q.decided_by OR
  NOT EXISTS(SELECT 1 FROM public.cash_registers WHERE id=v_f.register_id AND org_id=v_f.org_id AND entity_id=v_f.entity_id AND currency='USD') OR
  v_q.payload IS DISTINCT FROM jsonb_build_object('id',v_f.id,'register_id',v_f.register_id,'label',v_f.label,'environment',v_f.environment,'item_id',v_f.item_id,'account_id',v_f.account_id,'coverage_start',v_f.coverage_start,'enabled',v_f.enabled,'expected_version',v_f.version-1) THEN RAISE EXCEPTION 'bank feed approval graph is invalid';END IF;
 IF v_s.generation=0 THEN
  IF v_s.cursor IS NOT NULL OR v_s.last_run IS NOT NULL OR EXISTS(SELECT 1 FROM public.finance_bank_sync_runs WHERE feed_id=p_id AND state='COMMITTED') THEN RAISE EXCEPTION 'bank feed initial cursor is invalid';END IF;
 ELSE
  SELECT * INTO v_r FROM public.finance_bank_sync_runs WHERE id=v_s.last_run;
  IF v_r.feed_id IS DISTINCT FROM p_id OR v_r.state IS DISTINCT FROM 'COMMITTED' OR v_r.generation IS DISTINCT FROM v_s.generation OR v_r.next_cursor IS DISTINCT FROM v_s.cursor OR (SELECT count(*) FROM public.finance_bank_sync_runs WHERE feed_id=p_id AND state='COMMITTED')<>v_s.generation THEN RAISE EXCEPTION 'bank feed committed cursor chain is invalid';END IF;
  IF v_s.last_success_at IS DISTINCT FROM v_r.finished_at OR NOT EXISTS(SELECT 1 FROM public.finance_bank_sync_pages WHERE run_id=v_r.id AND page_number=v_r.page_count-1 AND payload->>'updateStatus'=v_s.update_status) THEN RAISE EXCEPTION 'bank feed synchronization evidence is invalid';END IF;
 END IF;
 IF (v_s.lease_token IS NULL) IS DISTINCT FROM (v_s.lease_until IS NULL) OR
  (v_s.active_run IS NULL AND (v_s.lease_token IS NOT NULL OR EXISTS(SELECT 1 FROM public.finance_bank_sync_runs WHERE feed_id=p_id AND state='ACTIVE'))) OR
  (v_s.active_run IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.finance_bank_sync_runs WHERE id=v_s.active_run AND feed_id=p_id AND org_id=v_f.org_id AND state='ACTIVE' AND generation=v_s.generation+1 AND origin_cursor IS NOT DISTINCT FROM v_s.cursor)) THEN RAISE EXCEPTION 'bank feed active lease graph is invalid';END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.validate_bank_sync_run_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_r public.finance_bank_sync_runs%ROWTYPE;v_page public.finance_bank_sync_pages%ROWTYPE;v_cursor text;v_count integer:=0;v_more boolean:=true;
BEGIN
 SELECT * INTO v_r FROM public.finance_bank_sync_runs WHERE id=p_id;
 IF v_r.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.finance_bank_feeds WHERE id=v_r.feed_id AND org_id=v_r.org_id) THEN RAISE EXCEPTION 'bank sync source unavailable';END IF;
 IF v_r.generation=1 THEN
  IF v_r.origin_cursor IS NOT NULL THEN RAISE EXCEPTION 'initial bank feed must start without a cursor';END IF;
 ELSIF NOT EXISTS(SELECT 1 FROM public.finance_bank_sync_runs WHERE feed_id=v_r.feed_id AND generation=v_r.generation-1 AND state='COMMITTED' AND next_cursor IS NOT DISTINCT FROM v_r.origin_cursor) THEN RAISE EXCEPTION 'bank sync prior cursor is unavailable';END IF;
 v_cursor:=v_r.origin_cursor;
 FOR v_page IN SELECT * FROM public.finance_bank_sync_pages WHERE run_id=p_id ORDER BY page_number LOOP
  IF NOT v_more OR v_page.org_id<>v_r.org_id OR v_page.page_number<>v_count OR v_page.cursor IS DISTINCT FROM v_cursor THEN RAISE EXCEPTION 'bank sync page chain is invalid';END IF;
  PERFORM public.validate_bank_feed_page(v_r.feed_id,v_page.payload);
  v_count:=v_count+1;v_cursor:=v_page.payload->>'nextCursor';v_more:=(v_page.payload->>'hasMore')::boolean;
 END LOOP;
 IF v_count<>v_r.page_count OR v_cursor IS DISTINCT FROM v_r.next_cursor OR (v_r.state='COMMITTED' AND (v_more OR v_r.finished_at IS NULL)) OR (v_r.state='ACTIVE' AND NOT v_more) THEN RAISE EXCEPTION 'bank sync completion graph is invalid';END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.validate_bank_transaction_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_t public.finance_bank_transactions%ROWTYPE;v_v public.finance_bank_transaction_revisions%ROWTYPE;v_n integer:=0;
BEGIN
 SELECT * INTO v_t FROM public.finance_bank_transactions WHERE id=p_id;
 IF v_t.id IS NULL THEN RAISE EXCEPTION 'bank transaction source unavailable';END IF;
 FOR v_v IN SELECT * FROM public.finance_bank_transaction_revisions WHERE transaction_id=p_id ORDER BY revision LOOP
  v_n:=v_n+1;
  IF v_v.revision<>v_n OR v_v.org_id<>v_t.org_id OR v_v.payload->>'externalId' IS DISTINCT FROM v_t.external_id OR
   NOT EXISTS(SELECT 1 FROM public.finance_bank_sync_runs r JOIN public.finance_bank_sync_pages p ON p.run_id=r.id WHERE r.id=v_v.run_id AND r.feed_id=v_t.feed_id AND r.org_id=v_t.org_id AND r.state='COMMITTED' AND p.id=v_v.page_id AND (p.payload->v_v.operation) @> jsonb_build_array(v_v.payload)) THEN RAISE EXCEPTION 'bank transaction revision graph is invalid';END IF;
 END LOOP;
 IF v_n<>v_t.revision OR v_v.payload IS DISTINCT FROM v_t.payload OR v_v.run_id IS DISTINCT FROM v_t.last_run THEN RAISE EXCEPTION 'bank transaction latest revision is invalid';END IF;
END; $$;
CREATE OR REPLACE FUNCTION public.validate_bank_feed_statement_graph(p_id uuid)
RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_b public.finance_bank_feed_statements%ROWTYPE;v_s public.cash_statements%ROWTYPE;v_x jsonb;v_lines jsonb;v_expected jsonb;v_actual jsonb;
BEGIN
 SELECT * INTO v_b FROM public.finance_bank_feed_statements WHERE id=p_id;SELECT * INTO v_s FROM public.cash_statements WHERE id=v_b.statement_id;
 IF v_b.id IS NULL OR v_s.org_id IS DISTINCT FROM v_b.org_id OR v_s.imported_by IS DISTINCT FROM v_b.created_by OR NOT EXISTS(SELECT 1 FROM public.finance_bank_feeds WHERE id=v_b.feed_id AND org_id=v_b.org_id AND register_id=v_s.register_id) OR
  NOT EXISTS(SELECT 1 FROM public.finance_bank_sync_runs WHERE feed_id=v_b.feed_id AND generation=v_b.generation AND state='COMMITTED') THEN RAISE EXCEPTION 'bank statement source binding is invalid';END IF;
 FOR v_x IN SELECT value FROM jsonb_array_elements(v_b.sources) LOOP
  PERFORM public.validate_bank_transaction_graph((v_x->>'id')::uuid);
  IF NOT EXISTS(SELECT 1 FROM public.finance_bank_transactions t JOIN public.finance_bank_transaction_revisions r ON r.transaction_id=t.id JOIN public.finance_bank_sync_runs b ON b.id=r.run_id WHERE t.id=(v_x->>'id')::uuid AND t.feed_id=v_b.feed_id AND r.revision=(v_x->>'revision')::int AND r.payload=v_x->'payload' AND b.generation<=v_b.generation) THEN RAISE EXCEPTION 'bank statement retained source revision is invalid';END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'payload',payload) ORDER BY external_id),'[]') INTO v_expected FROM
  (SELECT DISTINCT ON(t.id) t.id,t.external_id,r.revision,r.payload FROM public.finance_bank_transactions t JOIN public.finance_bank_transaction_revisions r ON r.transaction_id=t.id JOIN public.finance_bank_sync_runs run ON run.id=r.run_id
   WHERE t.feed_id=v_b.feed_id AND run.state='COMMITTED' AND run.generation<=v_b.generation ORDER BY t.id,r.revision DESC) retained
  WHERE payload->>'state'='POSTED' AND (payload->>'date')::date BETWEEN v_s.starts_on AND v_s.ends_on AND (payload->>'amount')::numeric<>0;
 IF v_expected IS DISTINCT FROM v_b.sources THEN RAISE EXCEPTION 'bank statement does not contain the complete retained source window';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('external_id',x->'payload'->>'externalId','booked_on',x->'payload'->>'date','description',x->'payload'->>'description','reference','Plaid verified transaction','amount',x->'payload'->>'amount') ORDER BY x->'payload'->>'externalId'),'[]') INTO v_lines FROM jsonb_array_elements(v_b.sources) x;
 SELECT coalesce(jsonb_agg(jsonb_build_object('external_id',external_id,'booked_on',booked_on,'description',description,'reference',reference,'amount',amount::text) ORDER BY external_id),'[]') INTO v_actual FROM public.cash_statement_lines WHERE statement_id=v_s.id;
 IF v_s.payload->'lines' IS DISTINCT FROM v_lines OR v_actual IS DISTINCT FROM v_lines THEN RAISE EXCEPTION 'bank statement lines differ from retained provider sources';END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.get_bank_feed_report(p_feed uuid,p_from date,p_through date,p_cursor text DEFAULT NULL,p_limit integer DEFAULT 100)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_f public.finance_bank_feeds%ROWTYPE;v_s public.finance_bank_sync_state%ROWTYPE;v_rows jsonb;v_sources jsonb;v_conflicts jsonb;v_total bigint;v_next text;v_id uuid;
BEGIN
 SELECT * INTO v_f FROM public.finance_bank_feeds WHERE id=p_feed AND org_id=public.get_user_org_id();
 IF v_f.id IS NULL THEN RAISE EXCEPTION 'bank feed report unavailable';END IF;
 IF p_from IS NULL OR p_through IS NULL OR p_from>p_through OR p_limit NOT BETWEEN 1 AND 200 OR length(coalesce(p_cursor,''))>150 THEN RAISE EXCEPTION 'invalid bank feed report range';END IF;
 PERFORM public.validate_bank_feed_graph(p_feed);
 SELECT * INTO v_s FROM public.finance_bank_sync_state WHERE feed_id=p_feed;
 SELECT count(*) INTO v_total FROM public.finance_bank_transactions WHERE feed_id=p_feed AND ((payload->>'date')::date BETWEEN p_from AND p_through OR payload->>'state'='REMOVED');
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'revision',revision,'source',payload) ORDER BY external_id),'[]'),max(external_id) INTO v_rows,v_next FROM
  (SELECT * FROM public.finance_bank_transactions WHERE feed_id=p_feed AND ((payload->>'date')::date BETWEEN p_from AND p_through OR payload->>'state'='REMOVED') AND (p_cursor IS NULL OR external_id>p_cursor) ORDER BY external_id LIMIT p_limit) rows;
 FOR v_id IN SELECT (x->>'id')::uuid FROM jsonb_array_elements(v_rows) x LOOP PERFORM public.validate_bank_transaction_graph(v_id);END LOOP;
 v_sources:=public.bank_feed_window(p_feed,p_from,p_through);
 FOR v_id IN SELECT (x->>'id')::uuid FROM jsonb_array_elements(v_sources) x LOOP PERFORM public.validate_bank_transaction_graph(v_id);END LOOP;
 SELECT coalesce(jsonb_agg(jsonb_build_object('statementId',s.id,'reference',s.reference,'status',s.status,'source',public.bank_feed_statement_source(s.id)) ORDER BY s.ends_on,s.id),'[]') INTO v_conflicts FROM public.finance_bank_feed_statements b JOIN public.cash_statements s ON s.id=b.statement_id WHERE b.feed_id=p_feed AND s.status<>'VOID';
 RETURN jsonb_build_object('feed',to_jsonb(v_f),'from',p_from,'through',p_through,'generation',v_s.generation,'updateStatus',v_s.update_status,'lastSuccessAt',v_s.last_success_at,'lastError',v_s.last_error,'nextAttemptAt',v_s.next_attempt_at,'syncInProgress',v_s.active_run IS NOT NULL,
  'transactions',v_rows,'totalTransactions',v_total,'nextCursor',CASE WHEN EXISTS(SELECT 1 FROM public.finance_bank_transactions WHERE feed_id=p_feed AND ((payload->>'date')::date BETWEEN p_from AND p_through OR payload->>'state'='REMOVED') AND external_id>v_next) THEN v_next ELSE NULL END,
  'postedCount',jsonb_array_length(v_sources),'postedNet',round(coalesce((SELECT sum((x->'payload'->>'amount')::numeric) FROM jsonb_array_elements(v_sources) x),0),2)::text,'windowRevision',md5(v_sources::text),'statements',v_conflicts);
END; $$;

CREATE OR REPLACE FUNCTION public.check_bank_feed_graph_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='finance_bank_feeds' THEN PERFORM public.validate_bank_feed_graph(NEW.id);
 ELSIF TG_TABLE_NAME='finance_bank_feed_statements' THEN PERFORM public.validate_bank_feed_statement_graph(NEW.id);
 ELSIF TG_TABLE_NAME='finance_bank_sync_runs' THEN PERFORM public.validate_bank_sync_run_graph(NEW.id);
 ELSIF TG_TABLE_NAME='finance_bank_transactions' THEN PERFORM public.validate_bank_transaction_graph(NEW.id);END IF;
 RETURN NULL;
END; $$;
DO $$ DECLARE t text;f record;
BEGIN
 FOREACH t IN ARRAY ARRAY['finance_bank_feeds','finance_bank_sync_state','finance_bank_sync_runs','finance_bank_sync_pages','finance_bank_transactions','finance_bank_transaction_revisions','finance_bank_feed_statements'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('DROP POLICY IF EXISTS tenant_read ON public.%I',t);
  EXECUTE format('CREATE POLICY tenant_read ON public.%I FOR SELECT TO authenticated USING(org_id=public.get_user_org_id())',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',t);
  IF t='finance_bank_feeds' THEN EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);END IF;
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_write ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_accounting_write()',t);
  EXECUTE format('DROP TRIGGER IF EXISTS accounting_truncate ON public.%I',t);EXECUTE format('CREATE TRIGGER accounting_truncate BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.guard_accounting_truncate()',t);
  IF t IN ('finance_bank_feeds','finance_bank_sync_runs','finance_bank_transactions','finance_bank_feed_statements') THEN
   EXECUTE format('DROP TRIGGER IF EXISTS bank_feed_graph ON public.%I',t);
   EXECUTE format('CREATE CONSTRAINT TRIGGER bank_feed_graph AFTER INSERT OR UPDATE ON public.%I DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_bank_feed_graph_trigger()',t);
  END IF;
 END LOOP;
 FOR f IN SELECT oid::regprocedure AS signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN
  ('pre_bank_feed_validate','pre_bank_feed_execute','pre_bank_feed_snapshot','pre_bank_feed_reconciliation','pre_bank_feed_request_review','pre_bank_feed_decide_review','pre_bank_feed_close_check','validate_finance_extension','execute_finance_extension','finance_source_snapshot','claim_bank_feed_sync','validate_bank_feed_page','append_bank_feed_page','release_bank_feed_sync','request_bank_feed_sync','bank_feed_window','bank_feed_ready','bank_feed_statement_source','import_bank_feed_statement','get_cash_reconciliation','request_cash_review','decide_cash_review','get_finance_close_check','validate_bank_feed_graph','validate_bank_sync_run_graph','validate_bank_transaction_graph','validate_bank_feed_statement_graph','get_bank_feed_report','check_bank_feed_graph_trigger') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
  IF f.proname IN ('claim_bank_feed_sync','append_bank_feed_page','release_bank_feed_sync') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature);
  ELSIF f.proname IN ('request_bank_feed_sync','import_bank_feed_statement','get_cash_reconciliation','request_cash_review','decide_cash_review','get_finance_close_check','get_bank_feed_report') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated',f.signature);END IF;
 END LOOP;
END; $$;
COMMIT;
